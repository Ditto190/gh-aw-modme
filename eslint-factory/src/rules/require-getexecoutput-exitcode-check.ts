import { AST_NODE_TYPES, ESLintUtils, TSESLint, TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(name => `https://github.com/github/gh-aw/tree/main/eslint-factory#${name}`);

// Namespace aliases under which `getExecOutput` is commonly invoked in actions/setup/js.
const EXEC_NAMESPACE_OBJECTS = new Set(["exec", "execApi", "childExec"]);
const GET_EXEC_OUTPUT_NAME = "getExecOutput";

type ScopeType = ReturnType<TSESLint.SourceCode["getScope"]>;
type ScopeVariable = ScopeType["variables"][number];

/**
 * Returns true when the expression is a call to `getExecOutput` (either bare or
 * namespaced via a known `@actions/exec`-style alias).
 * Matched forms:
 *   getExecOutput(cmd, args, opts)
 *   exec.getExecOutput(cmd, args, opts)
 *   execApi.getExecOutput(cmd, args, opts)
 */
function isGetExecOutputCall(node: TSESTree.Expression): boolean {
  if (node.type !== AST_NODE_TYPES.CallExpression) return false;
  const callee = node.callee;

  if (callee.type === AST_NODE_TYPES.Identifier && callee.name === GET_EXEC_OUTPUT_NAME) {
    return true;
  }

  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    EXEC_NAMESPACE_OBJECTS.has(callee.object.name) &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === GET_EXEC_OUTPUT_NAME
  ) {
    return true;
  }

  return false;
}

/**
 * Returns true when the call's options object argument (the third positional
 * argument) statically sets `ignoreReturnCode: true`. Spread properties and
 * identifier-only option objects can't be statically inspected, so they are
 * treated conservatively as NOT setting it — this avoids false positives on
 * calls that pass through a shared options object unrelated to ignoreReturnCode
 * (the common case in this codebase, e.g. `{ cwd }`-only helper option bags).
 */
function hasIgnoreReturnCodeTrue(callExpression: TSESTree.CallExpression): boolean {
  const optionsArg = callExpression.arguments[2];
  if (!optionsArg) return false;

  if (optionsArg.type === AST_NODE_TYPES.SpreadElement) return false;

  if (optionsArg.type === AST_NODE_TYPES.ObjectExpression) {
    for (const prop of optionsArg.properties) {
      if (prop.type === AST_NODE_TYPES.Property && !prop.computed && prop.key.type === AST_NODE_TYPES.Identifier && prop.key.name === "ignoreReturnCode") {
        return prop.value.type === AST_NODE_TYPES.Literal && prop.value.value === true;
      }
    }
    return false;
  }

  // Options passed via a shared/identifier config object can't be statically
  // inspected; don't assume it sets ignoreReturnCode to avoid false positives.
  return false;
}

/** Unwraps a single `await` so `await getExecOutput(...)` initializers are recognized. */
function unwrapAwait(node: TSESTree.Expression): TSESTree.Expression {
  return node.type === AST_NODE_TYPES.AwaitExpression ? node.argument : node;
}

function findVariableByName(sourceCode: Readonly<TSESLint.SourceCode>, node: TSESTree.Node, varName: string): ScopeVariable | undefined {
  let scope: ReturnType<typeof sourceCode.getScope> | null = sourceCode.getScope(node);
  while (scope) {
    const variable = scope.set.get(varName);
    if (variable) return variable;
    scope = scope.upper;
  }
  return undefined;
}

/** Returns true when `id` is read via a `.exitCode` member access (e.g. `result.exitCode`). */
function isExitCodeMemberRead(id: TSESTree.Identifier): boolean {
  const parent = id.parent;
  return parent !== undefined && parent.type === AST_NODE_TYPES.MemberExpression && parent.object === id && !parent.computed && parent.property.type === AST_NODE_TYPES.Identifier && parent.property.name === "exitCode";
}

/**
 * Returns true when `id` is returned as-is from its enclosing function (either via
 * an explicit `return result;` statement or as the implicit body of an arrow
 * function, e.g. `async () => result`). This covers the common wrapper-function
 * pattern where a helper fetches the result and hands it back to a caller that
 * performs the actual exitCode check — analysis can't follow the value across
 * the call boundary, so this is treated conservatively as already covered.
 */
function isReturnedAsIs(id: TSESTree.Identifier): boolean {
  const parent = id.parent;
  if (!parent) return false;
  if (parent.type === AST_NODE_TYPES.ReturnStatement && parent.argument === id) return true;
  if (parent.type === AST_NODE_TYPES.ArrowFunctionExpression && parent.body === id) return true;
  return false;
}

/** Returns true when any property in an ObjectPattern binds the `exitCode` key. */
function objectPatternBindsExitCode(node: TSESTree.ObjectPattern): boolean {
  for (const property of node.properties) {
    if (property.type !== AST_NODE_TYPES.Property || property.computed) continue;
    const key = property.key;
    const isExitCodeKey = (key.type === AST_NODE_TYPES.Identifier && key.name === "exitCode") || (key.type === AST_NODE_TYPES.Literal && key.value === "exitCode");
    if (isExitCodeKey) return true;
  }
  return false;
}

export const requireGetExecOutputExitCodeCheckRule = createRule({
  name: "require-getexecoutput-exitcode-check",
  meta: {
    type: "problem",
    docs: {
      description:
        "Require getExecOutput() results to have their exitCode inspected when the call opts into ignoreReturnCode. " +
        "getExecOutput() with ignoreReturnCode: true suppresses the thrown error on a non-zero exit so the caller can read stdout/stderr, " +
        "but if the result's exitCode (or a destructured `exitCode` binding) is never read, a failing command is silently treated as success. " +
        "Scope: this rule checks variable declarator initializers (including object destructuring) and does not analyze " +
        "AssignmentExpression forms or inline chains (`getExecOutput(...).stdout`).",
    },
    schema: [],
    messages: {
      missingExitCodeCheck:
        "getExecOutput() was called with ignoreReturnCode: true but the result's exitCode is never read. " +
        "A non-zero exit is silently ignored. Add a check such as: if (result.exitCode !== 0) { ... } or destructure `{ exitCode }`.",
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode;

    return {
      VariableDeclarator(node: TSESTree.VariableDeclarator) {
        if (!node.init) return;
        const initExpr = unwrapAwait(node.init);
        if (!isGetExecOutputCall(initExpr)) return;
        if (!hasIgnoreReturnCodeTrue(initExpr as TSESTree.CallExpression)) return;

        if (node.id.type === AST_NODE_TYPES.ObjectPattern) {
          if (!objectPatternBindsExitCode(node.id)) {
            context.report({ node: node.init, messageId: "missingExitCodeCheck" });
          }
          return;
        }

        // Only handle simple identifier bindings: const result = await getExecOutput(...)
        if (node.id.type !== AST_NODE_TYPES.Identifier) return;

        const variable = findVariableByName(sourceCode, node, node.id.name);
        if (!variable) return;

        const hasExitCodeRead = variable.references.some(ref => ref.identifier.type === AST_NODE_TYPES.Identifier && (isExitCodeMemberRead(ref.identifier) || isReturnedAsIs(ref.identifier)));

        if (!hasExitCodeRead) {
          context.report({ node: node.init, messageId: "missingExitCodeCheck" });
        }
      },
    };
  },
});
