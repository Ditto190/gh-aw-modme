import { AST_NODE_TYPES, ESLintUtils, TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(name => `https://github.com/github/gh-aw/tree/main/eslint-factory#${name}`);

/**
 * Returns true when the given `new Date(...)` call constructs a Date from a
 * dynamic value (e.g., an API timestamp string) rather than a value that is
 * always valid, such as `new Date()` (current time) or `new Date(Date.now())`.
 */
function isDynamicDateConstruction(node: TSESTree.NewExpression): boolean {
  if (node.callee.type !== AST_NODE_TYPES.Identifier || node.callee.name !== "Date") return false;
  if (node.arguments.length === 0) return false;

  const arg = node.arguments[0];

  // new Date(Date.now()) is always valid — not in scope.
  if (arg.type === AST_NODE_TYPES.CallExpression && arg.callee.type === AST_NODE_TYPES.MemberExpression) {
    const callee = arg.callee;
    if (callee.object.type === AST_NODE_TYPES.Identifier && callee.object.name === "Date" && !callee.computed && callee.property.type === AST_NODE_TYPES.Identifier && callee.property.name === "now") {
      return false;
    }
  }

  // Numeric literals are always valid (a fixed epoch ms value) — not in scope.
  if (arg.type === AST_NODE_TYPES.Literal && typeof arg.value === "number") return false;

  return true;
}

/**
 * Returns true when `node` is a NewExpression constructing a Date, or an
 * Identifier that resolves to one, and is known to be dynamically constructed.
 */
function isDateComparisonOperand(node: TSESTree.Expression, dynamicDateVars: ReadonlySet<string>): boolean {
  if (node.type === AST_NODE_TYPES.NewExpression) return isDynamicDateConstruction(node);
  if (node.type === AST_NODE_TYPES.Identifier) return dynamicDateVars.has(node.name);
  return false;
}

const COMPARISON_OPERATORS = new Set(["<", ">", "<=", ">="]);

export const requireDateValidityCheckRule = createRule({
  name: "require-date-validity-check",
  meta: {
    type: "problem",
    docs: {
      description:
        "Require validating Date objects constructed from dynamic values (e.g., API timestamps) before comparing them with relational operators. " +
        "An Invalid Date compared with <, >, <=, or >= silently evaluates to false for every comparison instead of throwing, " +
        "which can cause pagination cutoffs, rate-limit windows, or expiration checks to silently misbehave.",
    },
    schema: [],
    messages: {
      requireValidityCheck:
        "Date constructed from a dynamic value is compared with '{{operator}}' without validating it first. " + "Check Number.isNaN({{name}}.getTime()) before comparing, since an Invalid Date silently returns false for every relational comparison.",
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode;
    // Variable name -> the NewExpression node it was initialized from, for reporting.
    const dynamicDateDeclarators = new Map<string, TSESTree.NewExpression>();
    // Variable names confirmed validated via Number.isNaN(x.getTime()) / isNaN(x.getTime()) before use.
    const validated = new Set<string>();

    function isIsNaNCallee(callee: TSESTree.Expression): boolean {
      if (callee.type === AST_NODE_TYPES.Identifier && callee.name === "isNaN") return true;
      if (callee.type === AST_NODE_TYPES.MemberExpression && callee.object.type === AST_NODE_TYPES.Identifier && callee.object.name === "Number" && !callee.computed && callee.property.type === AST_NODE_TYPES.Identifier && callee.property.name === "isNaN") {
        return true;
      }
      return false;
    }

    return {
      VariableDeclarator(node) {
        if (node.id.type === AST_NODE_TYPES.Identifier && node.init?.type === AST_NODE_TYPES.NewExpression && isDynamicDateConstruction(node.init)) {
          dynamicDateDeclarators.set(node.id.name, node.init);
        }
      },

      // Number.isNaN(x.getTime()) or isNaN(x.getTime()) marks `x` as validated.
      CallExpression(node) {
        if (!isIsNaNCallee(node.callee) || node.arguments.length !== 1) return;
        const arg = node.arguments[0];
        if (arg.type === AST_NODE_TYPES.CallExpression && arg.callee.type === AST_NODE_TYPES.MemberExpression && !arg.callee.computed && arg.callee.property.type === AST_NODE_TYPES.Identifier && arg.callee.property.name === "getTime" && arg.callee.object.type === AST_NODE_TYPES.Identifier) {
          validated.add(arg.callee.object.name);
        }
      },

      BinaryExpression(node) {
        if (!COMPARISON_OPERATORS.has(node.operator)) return;

        const leftIsDate = isDateComparisonOperand(node.left as TSESTree.Expression, new Set(dynamicDateDeclarators.keys()));
        const rightIsDate = isDateComparisonOperand(node.right as TSESTree.Expression, new Set(dynamicDateDeclarators.keys()));
        if (!leftIsDate && !rightIsDate) return;

        // Inline `new Date(x) > new Date(y)` is always unvalidated by construction.
        const leftIsInlineNew = node.left.type === AST_NODE_TYPES.NewExpression;
        const rightIsInlineNew = node.right.type === AST_NODE_TYPES.NewExpression;

        const leftName = node.left.type === AST_NODE_TYPES.Identifier ? node.left.name : null;
        const rightName = node.right.type === AST_NODE_TYPES.Identifier ? node.right.name : null;

        const leftUnvalidated = leftIsDate && (leftIsInlineNew || (leftName !== null && !validated.has(leftName)));
        const rightUnvalidated = rightIsDate && (rightIsInlineNew || (rightName !== null && !validated.has(rightName)));

        if (!leftUnvalidated && !rightUnvalidated) return;

        const reportName = leftUnvalidated ? leftName ?? sourceCode.getText(node.left) : rightName ?? sourceCode.getText(node.right);

        context.report({
          node,
          messageId: "requireValidityCheck",
          data: { operator: node.operator, name: reportName },
        });
      },
    };
  },
});
