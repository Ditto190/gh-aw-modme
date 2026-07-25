import { AST_NODE_TYPES, ESLintUtils, TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(name => `https://github.com/github/gh-aw/tree/main/eslint-factory#${name}`);

/**
 * Returns true when `node` is a `process.env.X` or `env.X` member expression
 * where `env` is an identifier (commonly used as `env = process.env` parameter).
 */
function isEnvMemberExpression(node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.MemberExpression) return false;
  const obj = node.object;

  // process.env.X
  if (
    obj.type === AST_NODE_TYPES.MemberExpression &&
    !obj.computed &&
    obj.object.type === AST_NODE_TYPES.Identifier &&
    obj.object.name === "process" &&
    obj.property.type === AST_NODE_TYPES.Identifier &&
    obj.property.name === "env"
  ) {
    return true;
  }

  // env.X  (single-identifier env object — common as function parameter default: env = process.env)
  if (obj.type === AST_NODE_TYPES.Identifier && obj.name === "env") {
    return true;
  }

  return false;
}

/**
 * Returns the variable name bound by a VariableDeclarator if the init is
 * `Number(process.env.X)` or `Number(env.X)`.
 */
function getNumberEnvCallTarget(init: TSESTree.Expression | null | undefined): string | null {
  if (!init) return null;
  if (init.type !== AST_NODE_TYPES.CallExpression) return null;

  const callee = init.callee;
  if (callee.type !== AST_NODE_TYPES.Identifier || callee.name !== "Number") return null;
  if (init.arguments.length !== 1) return null;

  const arg = init.arguments[0];
  if (arg.type === AST_NODE_TYPES.SpreadElement) return null;

  if (isEnvMemberExpression(arg)) return "direct";

  // Number(process.env.X || fallback)  — already has a fallback, acceptable
  return null;
}

/**
 * Returns true when `node` is a call to `Number.isFinite(varName)`,
 * `Number.isNaN(varName)`, or `isNaN(varName)` (bare global).
 */
function isNumberGuardCall(node: TSESTree.Node, varName: string): boolean {
  if (node.type !== AST_NODE_TYPES.CallExpression) return false;
  if (node.arguments.length === 0) return false;
  const firstArg = node.arguments[0];
  if (firstArg.type !== AST_NODE_TYPES.Identifier || firstArg.name !== varName) return false;

  const callee = node.callee;

  // isNaN(varName)
  if (callee.type === AST_NODE_TYPES.Identifier && callee.name === "isNaN") return true;

  if (callee.type !== AST_NODE_TYPES.MemberExpression) return false;
  if (callee.object.type !== AST_NODE_TYPES.Identifier || callee.object.name !== "Number") return false;
  if (callee.computed) return false;
  if (callee.property.type !== AST_NODE_TYPES.Identifier) return false;

  return callee.property.name === "isFinite" || callee.property.name === "isNaN";
}

/**
 * Searches `stmts` (starting from index `fromIndex`) for any expression that
 * calls Number.isFinite / Number.isNaN / isNaN with `varName` as its argument,
 * including inside `if` conditions and unary `!` wrappers.
 */
function hasGuardInStatements(stmts: TSESTree.Statement[], fromIndex: number, varName: string): boolean {
  for (let i = fromIndex; i < stmts.length; i++) {
    const stmt = stmts[i];

    // Direct expression statement: Number.isFinite(x); or isNaN(x);
    if (stmt.type === AST_NODE_TYPES.ExpressionStatement && isNumberGuardCall(stmt.expression, varName)) {
      return true;
    }

    // if (Number.isFinite(x)) / if (!Number.isFinite(x)) / if (Number.isNaN(x))
    if (stmt.type === AST_NODE_TYPES.IfStatement) {
      const test = stmt.test;
      if (isNumberGuardCall(test, varName)) return true;
      if (
        test.type === AST_NODE_TYPES.UnaryExpression &&
        test.operator === "!" &&
        isNumberGuardCall(test.argument, varName)
      ) {
        return true;
      }
      // if (expr && Number.isFinite(x)) or similar LogicalExpression
      if (test.type === AST_NODE_TYPES.LogicalExpression) {
        if (isNumberGuardCall(test.left, varName) || isNumberGuardCall(test.right, varName)) return true;
        // if (!Number.isFinite(x) || x <= 0) pattern: left is UnaryExpression
        if (
          test.left.type === AST_NODE_TYPES.UnaryExpression &&
          test.left.operator === "!" &&
          isNumberGuardCall(test.left.argument, varName)
        ) {
          return true;
        }
        // if (cond && !Number.isFinite(x)) pattern: right is UnaryExpression
        if (
          test.right.type === AST_NODE_TYPES.UnaryExpression &&
          test.right.operator === "!" &&
          isNumberGuardCall(test.right.argument, varName)
        ) {
          return true;
        }
      }
    }

    // return / throw without using the variable terminates the block safely;
    // but we can't easily check "does return use varName", so we only treat
    // throw as unconditionally safe (it never silently proceeds).
    if (stmt.type === AST_NODE_TYPES.ThrowStatement) {
      return true;
    }
  }
  return false;
}

export const noUnguardedNumberEnvReadRule = createRule({
  name: "no-unguarded-number-env-read",
  meta: {
    type: "problem",
    docs: {
      description:
        "Require a Number.isFinite() or Number.isNaN() guard after Number(process.env.X) or Number(env.X). Environment variables are always strings; passing an unset or non-numeric variable yields NaN, which silently propagates into timeouts, thresholds, and arithmetic comparisons.",
    },
    schema: [],
    messages: {
      missingGuard:
        "Number({{source}}) may produce NaN when the environment variable is unset or non-numeric. Guard the result with Number.isFinite({{varName}}) or Number.isNaN({{varName}}) before using it.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      BlockStatement(block) {
        const stmts = block.body;

        for (let i = 0; i < stmts.length; i++) {
          const stmt = stmts[i];
          if (stmt.type !== AST_NODE_TYPES.VariableDeclaration) continue;

          for (const declarator of stmt.declarations) {
            if (declarator.id.type !== AST_NODE_TYPES.Identifier) continue;
            const varName = declarator.id.name;
            const match = getNumberEnvCallTarget(declarator.init);
            if (!match) continue;

            // Look for a guard in the subsequent statements of the same block.
            if (!hasGuardInStatements(stmts, i + 1, varName)) {
              const init = declarator.init as TSESTree.CallExpression;
              const sourceArg = init.arguments[0];
              const sourceText = context.sourceCode.getText(sourceArg as TSESTree.Node);
              context.report({
                node: declarator,
                messageId: "missingGuard",
                data: { source: sourceText, varName },
              });
            }
          }
        }
      },
    };
  },
});
