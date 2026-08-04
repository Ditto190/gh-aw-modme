import { AST_NODE_TYPES, ESLintUtils, TSESTree } from "@typescript-eslint/utils";

const createRule = ESLintUtils.RuleCreator(name => `https://github.com/github/gh-aw/tree/main/eslint-factory#${name}`);

/**
 * Returns true when `node` is a statically-known non-zero/non-empty value —
 * i.e. an indent argument that would actually trigger pretty-printing.
 * A literal `0`, `""`, `null`, or `undefined` disables pretty-printing and is fine.
 */
function isTruthyIndentArgument(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.Literal) {
    return node.value != null && node.value !== 0 && node.value !== "";
  }
  if (node.type === AST_NODE_TYPES.Identifier && node.name === "undefined") return false;
  // Any other expression (identifier, member expression, template literal, etc.)
  // cannot be statically proven safe — flag it to avoid missing real bugs.
  return true;
}

/**
 * Returns true when the call expression is `JSON.stringify(value, replacer, indent)`
 * with an indent argument that would produce multi-line, pretty-printed output.
 */
function isPrettyPrintedJsonStringify(node: TSESTree.CallExpression): boolean {
  const callee = node.callee;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) return false;
  if (callee.object.type !== AST_NODE_TYPES.Identifier || callee.object.name !== "JSON") return false;
  if (callee.property.type !== AST_NODE_TYPES.Identifier || callee.property.name !== "stringify") return false;

  const indentArg = node.arguments[2];
  if (!indentArg) return false;
  if (indentArg.type === AST_NODE_TYPES.SpreadElement) return false;

  return isTruthyIndentArgument(indentArg);
}

/**
 * Returns true when `node` (an expression being appended) contains, at its top level
 * (through string concatenation / template literals), a pretty-printed JSON.stringify call.
 */
function containsPrettyPrintedJsonStringify(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return isPrettyPrintedJsonStringify(node);
  }
  if (node.type === AST_NODE_TYPES.BinaryExpression && node.operator === "+") {
    return containsPrettyPrintedJsonStringify(node.left) || containsPrettyPrintedJsonStringify(node.right);
  }
  if (node.type === AST_NODE_TYPES.TemplateLiteral) {
    return node.expressions.some(expr => containsPrettyPrintedJsonStringify(expr));
  }
  return false;
}

/**
 * Returns true when the callee resolves to `fs.appendFileSync` (or `fs.promises.appendFile`),
 * whether bound through an `fs` identifier or a destructured `appendFileSync` import.
 */
function isAppendFileCall(node: TSESTree.CallExpression): boolean {
  const callee = node.callee;

  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === "appendFileSync" || callee.name === "appendFile";
  }

  if (callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed && callee.property.type === AST_NODE_TYPES.Identifier) {
    if (callee.property.name === "appendFileSync") return true;
    if (callee.property.name === "appendFile" && callee.object.type === AST_NODE_TYPES.MemberExpression && !callee.object.computed && callee.object.property.type === AST_NODE_TYPES.Identifier && callee.object.property.name === "promises") {
      return true;
    }
  }

  return false;
}

export const noPrettyPrintedJsonlAppendRule = createRule({
  name: "no-pretty-printed-jsonl-append",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow appending a pretty-printed JSON.stringify(value, null, N) result via fs.appendFileSync/appendFile. " +
        "JSONL (JSON Lines) output files require exactly one JSON object per line; passing a truthy indent argument " +
        "produces multi-line output that corrupts line-based JSONL parsers reading these files (e.g. GITHUB_OUTPUT, " +
        "safe-output, and log-collection pipelines in actions/setup/js).",
    },
    schema: [],
    messages: {
      noPrettyPrintedAppend:
        "JSON.stringify(..., {{indent}}) with a truthy indent argument produces multi-line output. " +
        "Appending this to a file with appendFileSync/appendFile breaks JSONL's one-object-per-line format. " +
        "Call JSON.stringify(value) without indentation for JSONL writes.",
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode;

    return {
      CallExpression(node) {
        if (!isAppendFileCall(node)) return;

        const dataArg = node.arguments[1];
        if (!dataArg) return;

        if (!containsPrettyPrintedJsonStringify(dataArg)) return;

        // Find the specific JSON.stringify call to report the indent arg text on.
        function findStringifyCall(n: TSESTree.Node): TSESTree.CallExpression | null {
          if (n.type === AST_NODE_TYPES.CallExpression && isPrettyPrintedJsonStringify(n)) return n;
          if (n.type === AST_NODE_TYPES.BinaryExpression && n.operator === "+") {
            return findStringifyCall(n.left) || findStringifyCall(n.right);
          }
          if (n.type === AST_NODE_TYPES.TemplateLiteral) {
            for (const expr of n.expressions) {
              const found = findStringifyCall(expr);
              if (found) return found;
            }
          }
          return null;
        }

        const stringifyCall = findStringifyCall(dataArg);
        const indentArg = stringifyCall?.arguments[2];

        context.report({
          node: stringifyCall ?? node,
          messageId: "noPrettyPrintedAppend",
          data: { indent: indentArg ? sourceCode.getText(indentArg) : "…" },
        });
      },
    };
  },
});
