import { ESLintUtils, TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(name => `https://github.com/github/gh-aw/tree/main/eslint-factory#${name}`);
const GLOBAL_PARSE_INT_OBJECTS = new Set(["Number", "globalThis", "window", "global"]);
const NAN_GUARD_CALLEE_NAMES = new Set(["isNaN", "Number"]);

/**
 * Returns true when the given call expression is `parseInt(...)` / `Number.parseInt(...)`
 * (including `globalThis.parseInt`, `Number["parseInt"]`, etc.), regardless of radix.
 */
function isParseIntCall(node: TSESTree.CallExpression): boolean {
  if (node.callee.type === "Identifier" && node.callee.name === "parseInt") {
    return true;
  }

  if (node.callee.type === "MemberExpression" && node.callee.object.type === "Identifier" && GLOBAL_PARSE_INT_OBJECTS.has(node.callee.object.name)) {
    const property = node.callee.property;
    return (property.type === "Identifier" && property.name === "parseInt") || (property.type === "Literal" && property.value === "parseInt");
  }

  return false;
}

/**
 * Returns true when the expression references `process.env.<NAME>` (optionally through
 * optional-chaining member access such as `process.env.X?.trim()`), anywhere within it —
 * this recurses into `||`/`??` fallback expressions and simple call chains.
 */
function referencesProcessEnv(node: TSESTree.Node): boolean {
  switch (node.type) {
    case "MemberExpression": {
      if (node.object.type === "MemberExpression" && node.object.object.type === "Identifier" && node.object.object.name === "process" && node.object.property.type === "Identifier" && node.object.property.name === "env") {
        return true;
      }
      return referencesProcessEnv(node.object);
    }
    case "ChainExpression":
      return referencesProcessEnv(node.expression);
    case "CallExpression":
      return referencesProcessEnv(node.callee) || node.arguments.some(arg => arg.type !== "SpreadElement" && referencesProcessEnv(arg));
    case "LogicalExpression":
      return referencesProcessEnv(node.left) || referencesProcessEnv(node.right);
    default:
      return false;
  }
}

/**
 * Returns true when the argument passed to parseInt/Number.parseInt reads from `process.env`.
 */
function firstArgReferencesProcessEnv(node: TSESTree.CallExpression): boolean {
  const firstArg = node.arguments[0];
  if (!firstArg || firstArg.type === "SpreadElement") return false;
  return referencesProcessEnv(firstArg);
}

/**
 * Finds the first parseInt()/Number.parseInt() call reading from process.env within `node`,
 * unwrapping conditional (ternary) and logical (||/??) expressions such as
 * `process.env.X ? parseInt(process.env.X, 10) : fallback`.
 */
function findEnvParseIntCall(node: TSESTree.Node): TSESTree.CallExpression | null {
  if (node.type === "CallExpression" && isParseIntCall(node) && firstArgReferencesProcessEnv(node)) {
    return node;
  }

  if (node.type === "ConditionalExpression") {
    return findEnvParseIntCall(node.consequent) || findEnvParseIntCall(node.alternate);
  }

  if (node.type === "LogicalExpression") {
    return findEnvParseIntCall(node.left) || findEnvParseIntCall(node.right);
  }

  return null;
}

export const requireEnvParseIntNanCheckRule = createRule({
  name: "require-env-parseint-nan-check",
  meta: {
    type: "problem",
    docs: {
      description:
        "Require a Number.isNaN()/Number.isFinite() guard after parsing a process.env value with parseInt()/Number.parseInt() in gh-aw JavaScript runtime scripts, since a malformed (non-numeric) environment variable silently produces NaN and can bypass downstream size/count/limit comparisons.",
    },
    schema: [],
    messages: {
      requireNanCheck:
        "'{{name}}' is derived from parseInt()/Number.parseInt() on a process.env value but is never checked with Number.isNaN()/Number.isFinite() before use. A malformed environment variable will silently produce NaN, and comparisons like `value > NaN` are always false, bypassing the intended limit/guard.",
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode;

    /**
     * Returns true when `name` appears as an argument to Number.isNaN/isNaN/Number.isFinite/isFinite
     * anywhere in the given set of statements (a simple, conservative scan of the enclosing block).
     */
    function isGuardedInStatements(statements: TSESTree.Statement[], name: string): boolean {
      return statements.some(statement => {
        let guarded = false;

        function visit(node: TSESTree.Node | null | undefined): void {
          if (!node || guarded) return;

          if (node.type === "CallExpression") {
            const callee = node.callee;
            const isBareGuard = callee.type === "Identifier" && (callee.name === "isNaN" || callee.name === "isFinite");
            const isMemberGuard = callee.type === "MemberExpression" && callee.object.type === "Identifier" && NAN_GUARD_CALLEE_NAMES.has(callee.object.name) && callee.property.type === "Identifier" && (callee.property.name === "isNaN" || callee.property.name === "isFinite");

            if (isBareGuard || isMemberGuard) {
              const referencesName = node.arguments.some(arg => arg.type === "Identifier" && arg.name === name);
              if (referencesName) {
                guarded = true;
                return;
              }
            }
          }

          for (const key of Object.keys(node)) {
            if (key === "parent") continue;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const value = (node as any)[key];
            if (Array.isArray(value)) {
              for (const item of value) {
                if (item && typeof item.type === "string") visit(item as TSESTree.Node);
              }
            } else if (value && typeof value.type === "string") {
              visit(value as TSESTree.Node);
            }
          }
        }

        visit(statement);
        return guarded;
      });
    }

    return {
      VariableDeclarator(node) {
        if (node.id.type !== "Identifier" || !node.init) return;
        if (!findEnvParseIntCall(node.init)) return;

        const declaration = node.parent;
        if (!declaration || declaration.type !== "VariableDeclaration") return;

        const block = declaration.parent;
        if (!block || !("body" in block) || !Array.isArray((block as { body: unknown }).body)) return;

        const statements = (block as { body: TSESTree.Statement[] }).body;
        const declarationIndex = statements.indexOf(declaration as unknown as TSESTree.Statement);
        const followingStatements = declarationIndex >= 0 ? statements.slice(declarationIndex) : statements;

        if (isGuardedInStatements(followingStatements, node.id.name)) return;

        context.report({ node, messageId: "requireNanCheck", data: { name: node.id.name } });
      },
    };
  },
});
