import { AST_NODE_TYPES, ESLintUtils, TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(name => `https://github.com/github/gh-aw/tree/main/eslint-factory#${name}`);

/**
 * Returns true when a function body (block or expression) is semantically empty:
 *  - block statement with no statements, OR
 *  - expression body that is `undefined` or `void 0`.
 */
function isFunctionBodyEmpty(fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression): boolean {
  const body = fn.body;
  if (body.type === AST_NODE_TYPES.BlockStatement) {
    return body.body.length === 0;
  }
  // Concise arrow: () => undefined  or  () => void 0
  if (body.type === AST_NODE_TYPES.Identifier && body.name === "undefined") return true;
  if (body.type === AST_NODE_TYPES.UnaryExpression && body.operator === "void") return true;
  return false;
}

/**
 * Returns true when the node is a zero-parameter (or no-binding) function that
 * is the first argument to a `.catch()` call.
 */
function isBareEmptyCatchHandler(fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression): boolean {
  if (!isFunctionBodyEmpty(fn)) return false;
  const parent = fn.parent;
  if (!parent || parent.type !== AST_NODE_TYPES.CallExpression) return false;
  if (parent.arguments[0] !== fn) return false;
  const callee = parent.callee;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) return false;
  const prop = callee.property;
  return prop.type === AST_NODE_TYPES.Identifier && prop.name === "catch";
}

export const noPromiseCatchEmptyBodyRule = createRule({
  name: "no-promise-catch-empty-body",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow empty .catch(() => {}) handlers on promise chains — they silently swallow errors with no logging or diagnostics in GitHub Actions scripts.",
    },
    schema: [],
    messages: {
      emptyBody:
        "Empty .catch(() => {}) silently swallows the rejection. " +
        "Log the error (e.g. core.warning(getErrorMessage(err))) or use a named catch variable to make the intent explicit. " +
        "If the failure is intentionally non-fatal, add a comment explaining why.",
    },
  },
  defaultOptions: [],
  create(context) {
    function check(fn: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression): void {
      if (isBareEmptyCatchHandler(fn)) {
        context.report({ node: fn.parent as TSESTree.Node, messageId: "emptyBody" });
      }
    }

    return {
      ArrowFunctionExpression: check,
      FunctionExpression: check,
    };
  },
});
