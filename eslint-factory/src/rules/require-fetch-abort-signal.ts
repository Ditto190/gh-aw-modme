import { AST_NODE_TYPES, ESLintUtils, TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(name => `https://github.com/github/gh-aw/tree/main/eslint-factory#${name}`);

/**
 * Returns true when the call expression is a direct `fetch(...)` call
 * (not a member call like `something.fetch(...)`).
 */
function isFetchCall(node: TSESTree.CallExpression): boolean {
  return node.callee.type === AST_NODE_TYPES.Identifier && node.callee.name === "fetch";
}

/**
 * Returns true when the fetch options object argument carries a `signal` property,
 * covering both plain properties (`signal: ac.signal`) and shorthand (`{ signal }`).
 */
function hasSignalProperty(optionsArg: TSESTree.CallExpressionArgument): boolean {
  if (optionsArg.type !== AST_NODE_TYPES.ObjectExpression) return false;
  for (const prop of optionsArg.properties) {
    // A spread (`{ ...base }`) may carry a signal we can't statically see; skip to avoid
    // false positives rather than assume it's missing.
    if (prop.type === AST_NODE_TYPES.SpreadElement) return true;
    if (prop.computed) continue;
    const key = prop.key;
    if (key.type === AST_NODE_TYPES.Identifier && key.name === "signal") return true;
    if (key.type === AST_NODE_TYPES.Literal && key.value === "signal") return true;
  }
  return false;
}

export const requireFetchAbortSignalRule = createRule({
  name: "require-fetch-abort-signal",
  meta: {
    type: "problem",
    docs: {
      description:
        "Require `fetch(...)` calls in actions/setup/js scripts to pass an options object with a `signal` " +
        "(e.g. `AbortSignal.timeout(ms)`). Without a signal, a hung or slow upstream server leaves the " +
        "fetch pending indefinitely, which can stall or time out the whole GitHub Actions job instead of " +
        "failing fast with a clear error.",
    },
    schema: [],
    messages: {
      requireAbortSignal: "fetch({{url}}) has no `signal` option — a hung server can block this call indefinitely. Pass `signal: AbortSignal.timeout(ms)`.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        if (!isFetchCall(node)) return;
        if (node.arguments.length === 0) return;

        const optionsArg = node.arguments.length >= 2 ? node.arguments[1] : undefined;

        if (optionsArg && hasSignalProperty(optionsArg)) return;

        // If the options argument isn't a literal object (e.g. a spread, identifier, or
        // computed expression), we can't statically verify the signal is absent, so skip
        // to avoid false positives.
        if (optionsArg && optionsArg.type !== AST_NODE_TYPES.ObjectExpression) return;

        const urlArg = node.arguments[0];
        const urlText = urlArg.type === AST_NODE_TYPES.Literal && typeof urlArg.value === "string" ? JSON.stringify(urlArg.value) : "...";

        context.report({
          node,
          messageId: "requireAbortSignal",
          data: { url: urlText },
        });
      },
    };
  },
});
