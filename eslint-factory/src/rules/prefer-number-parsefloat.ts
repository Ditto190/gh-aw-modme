import { AST_NODE_TYPES, ESLintUtils, TSESLint, TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(name => `https://github.com/github/gh-aw/tree/main/eslint-factory#${name}`);

export const preferNumberParseFloatRule = createRule({
  name: "prefer-number-parsefloat",
  meta: {
    type: "suggestion",
    fixable: "code",
    hasSuggestions: true,
    docs: {
      description: "Prefer Number.parseFloat() over global parseFloat() to avoid depending on implicit global bindings in GitHub Actions scripts.",
    },
    schema: [],
    messages: {
      preferNumberParseFloat: "Prefer Number.parseFloat(...) over global parseFloat(...).",
      replaceWithNumberParseFloat: "Replace callee with Number.parseFloat.",
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode;
    type SourceCodeScope = ReturnType<typeof sourceCode.getScope>;

    function hasLocalBinding(node: TSESTree.Node, name: string): boolean {
      let scope: SourceCodeScope | null = sourceCode.getScope(node);
      while (scope) {
        const variable = scope.set.get(name);
        if (variable && variable.defs.length > 0) return true;
        scope = scope.upper;
      }
      return false;
    }

    return {
      CallExpression(node: TSESTree.CallExpression) {
        const callee = node.callee;
        if (callee.type !== AST_NODE_TYPES.Identifier || callee.name !== "parseFloat") return;
        if (hasLocalBinding(node, "parseFloat")) return;

        const numberUnshadowed = !hasLocalBinding(node, "Number");

        if (numberUnshadowed) {
          context.report({
            node: callee,
            messageId: "preferNumberParseFloat",
            fix(fixer: TSESLint.RuleFixer) {
              return fixer.replaceText(callee, "Number.parseFloat");
            },
          });
        } else {
          context.report({
            node: callee,
            messageId: "preferNumberParseFloat",
            suggest: [
              {
                messageId: "replaceWithNumberParseFloat",
                fix(fixer: TSESLint.RuleFixer) {
                  return fixer.replaceText(callee, "Number.parseFloat");
                },
              },
            ],
          });
        }
      },
    };
  },
});
