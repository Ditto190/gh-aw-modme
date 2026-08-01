import { AST_NODE_TYPES, ESLintUtils, TSESLint } from "@typescript-eslint/utils";
import { CORE_ALIASES } from "./core-aliases";
import { isCoreAliasIdentifier, isDestructuredCoreMethodIdentifier } from "./core-method-resolve";
import { nonStringKind, NULL_KIND, UNDEFINED_KIND } from "./non-string-kind";

const createRule = ESLintUtils.RuleCreator(name => `https://github.com/github/gh-aw/tree/main/eslint-factory#${name}`);

export const noCoreSetFailedNonStringRule = createRule({
  name: "no-core-setfailed-non-string",
  meta: {
    type: "problem",
    hasSuggestions: true,
    docs: {
      description:
        "Require core.setFailed message arguments to be explicit strings; passing numbers, booleans, null, undefined, or .length can silently produce unexpected annotation text (e.g. 'null', 'true') in the GitHub Actions job summary and check run. Detects calls in the form core.setFailed(message), aliased (const c = core; c.setFailed(...)), and destructured (const { setFailed } = core; setFailed(...)).",
    },
    schema: [],
    messages: {
      nonStringValue:
        "The setFailed message {{valueText}} is a {{kind}}. Implicit coercion may produce unexpected annotation text such as 'null' or 'true' in the workflow run summary. Use an explicit string conversion and choose the suggestion that matches the intended message semantics.",
      wrapWithString: "Wrap with String({{valueText}}) to make coercion explicit. For null/undefined, use an explicit default (for example '') when empty-message semantics are intended.",
      useEmptyString: "Replace with \"\" (empty string) — use this when the intended message is empty rather than the literal word 'null' or 'undefined'.",
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode;

    return {
      CallExpression(node) {
        const callee = node.callee;

        if (callee.type === AST_NODE_TYPES.MemberExpression) {
          // Object must be a known @actions/core alias or a single-assignment alias (e.g. `const c = core`)
          if (callee.object.type !== AST_NODE_TYPES.Identifier) return;
          if (!CORE_ALIASES.has(callee.object.name) && !isCoreAliasIdentifier(callee.object, sourceCode)) return;

          // Property must be `setFailed` (direct or computed string-literal access)
          const prop = callee.property;
          const isSetFailedProp = (!callee.computed && prop.type === AST_NODE_TYPES.Identifier && prop.name === "setFailed") || (callee.computed && prop.type === AST_NODE_TYPES.Literal && prop.value === "setFailed");
          if (!isSetFailedProp) return;
        } else if (callee.type === AST_NODE_TYPES.Identifier) {
          // Destructured: `const { setFailed } = core; setFailed(...)` or `const { setFailed: alias } = core; alias(...)`
          if (!isDestructuredCoreMethodIdentifier(callee, "setFailed", sourceCode)) return;
        } else {
          return;
        }

        // core.setFailed expects exactly one argument: (message)
        if (node.arguments.length !== 1) return;

        const valueArg = node.arguments[0];

        const kind = nonStringKind(valueArg);
        if (kind === null) return;

        const valueText = sourceCode.getText(valueArg);

        const isNullOrUndefined = kind === NULL_KIND || kind === UNDEFINED_KIND;

        context.report({
          node,
          messageId: "nonStringValue",
          data: { kind, valueText },
          suggest: [
            ...(isNullOrUndefined
              ? [
                  {
                    messageId: "useEmptyString" as const,
                    fix(fixer: TSESLint.RuleFixer) {
                      return fixer.replaceText(valueArg, `""`);
                    },
                  },
                ]
              : []),
            {
              messageId: "wrapWithString" as const,
              data: { valueText },
              fix(fixer: TSESLint.RuleFixer) {
                return fixer.replaceText(valueArg, `String(${valueText})`);
              },
            },
          ],
        });
      },
    };
  },
});
