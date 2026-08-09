import { AST_NODE_TYPES, ESLintUtils, TSESTree } from "@typescript-eslint/utils";
import { buildTryCatchSuggestion, isDeferredCallback, SAFE_WRAPPABLE_STATEMENT_TYPES } from "./try-catch-rule-utils";

const createRule = ESLintUtils.RuleCreator(name => `https://github.com/github/gh-aw/tree/main/eslint-factory#${name}`);

// Global functions that throw URIError on malformed percent-encoded sequences
// (e.g. a lone "%" or an incomplete escape like "%E0%A4%A"). Both decode a
// runtime string and can crash the action if the input is attacker- or
// user-controlled and not wrapped in try/catch.
const DECODE_URI_FUNCTION_NAMES = new Set(["decodeURIComponent", "decodeURI"]);

export const requireDecodeUriTryCatchRule = createRule({
  name: "require-decode-uri-try-catch",
  meta: {
    type: "problem",
    hasSuggestions: true,
    docs: {
      description:
        "Require decodeURIComponent/decodeURI calls in actions/setup/js scripts to be wrapped in try/catch. " +
        "These functions throw a URIError on malformed percent-encoded sequences (e.g. a lone '%' or an " +
        "incomplete escape), which crashes the action if the input is not a compile-time constant.",
    },
    schema: [],
    messages: {
      requireTryCatch: "Wrap {{fn}}({{arg}}) in try/catch — {{fn}} throws URIError for malformed percent-encoded input " + "and will crash the action if unhandled.",
      wrapInTryCatch: "Wrap in try { ... } catch { ... } and re-throw with { cause: err } to preserve context.",
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode;
    type SourceCodeScope = ReturnType<typeof sourceCode.getScope>;

    /** Returns true when name is bound by a local definition, meaning it shadows the global. */
    function hasLocalBinding(node: TSESTree.Node, name: string): boolean {
      let scope: SourceCodeScope | null = sourceCode.getScope(node);
      while (scope) {
        const variable = scope.set.get(name);
        if (variable?.defs.length) {
          return true;
        }
        scope = scope.upper;
      }
      return false;
    }

    function isInsideTryBlock(node: TSESTree.Node): boolean {
      const ancestors = sourceCode.getAncestors(node);
      let crossedDeferredBoundary = false;

      for (let i = ancestors.length - 1; i >= 0; i--) {
        const ancestor = ancestors[i];

        if (isDeferredCallback(ancestor)) {
          crossedDeferredBoundary = true;
        }

        if (ancestor.type === "TryStatement" && !crossedDeferredBoundary && ancestor.handler != null) {
          const block = ancestor.block;
          if (node.range != null && block.range != null && node.range[0] >= block.range[0] && node.range[1] <= block.range[1]) {
            return true;
          }
        }
      }

      return false;
    }

    // Only ExpressionStatement and ReturnStatement are safe to wrap: they are self-contained
    // statements whose removal does not leave other code referencing out-of-scope bindings.
    // VariableDeclaration is intentionally excluded: wrapping `const x = decodeURIComponent(v)`
    // would place subsequent uses of `x` outside the try block, leaving them unreachable.
    function findEnclosingStatement(node: TSESTree.Node): TSESTree.Statement | null {
      const ancestors = sourceCode.getAncestors(node);
      for (let i = ancestors.length - 1; i >= 0; i--) {
        const ancestor = ancestors[i];
        if (SAFE_WRAPPABLE_STATEMENT_TYPES.has(ancestor.type)) {
          return ancestor as TSESTree.Statement;
        }
      }
      return null;
    }

    /** Returns true when an expression is a compile-time constant string. */
    function isStaticStringExpression(arg: TSESTree.CallExpressionArgument): boolean {
      if (arg.type === AST_NODE_TYPES.Literal && typeof (arg as TSESTree.StringLiteral).value === "string") return true;
      if (arg.type === AST_NODE_TYPES.TemplateLiteral && (arg as TSESTree.TemplateLiteral).expressions.length === 0) return true;
      if (arg.type === AST_NODE_TYPES.BinaryExpression && arg.operator === "+") {
        return isStaticStringExpression(arg.left) && isStaticStringExpression(arg.right);
      }
      return false;
    }

    /** Returns true when an argument is a runtime-dynamic expression (not a compile-time constant). */
    function isDynamicArg(arg: TSESTree.CallExpressionArgument): boolean {
      if (arg.type === "SpreadElement") return false;
      return !isStaticStringExpression(arg);
    }

    return {
      CallExpression(node) {
        if (node.callee.type !== AST_NODE_TYPES.Identifier) return;
        const fnName = node.callee.name;
        if (!DECODE_URI_FUNCTION_NAMES.has(fnName)) return;
        // Skip when decodeURIComponent/decodeURI is shadowed by a local binding.
        if (hasLocalBinding(node, fnName)) return;

        const firstArg = node.arguments[0];
        if (firstArg === undefined) return;
        if (!isDynamicArg(firstArg)) return;

        if (isInsideTryBlock(node)) return;

        const argText = sourceCode.getText(firstArg as TSESTree.Node);
        const stmt = findEnclosingStatement(node);

        context.report({
          node,
          messageId: "requireTryCatch",
          data: { fn: fnName, arg: argText },
          suggest: stmt
            ? [
                {
                  messageId: "wrapInTryCatch",
                  fix(fixer) {
                    const stmtText = sourceCode.getText(stmt);
                    const startLine = stmt.loc?.start.line;
                    const stmtLine = startLine !== undefined ? (sourceCode.lines[startLine - 1] ?? "") : "";
                    const indent = stmtLine.match(/^(\s*)/)?.[1] ?? "";
                    return fixer.replaceText(
                      stmt,
                      buildTryCatchSuggestion(stmtText, {
                        indent,
                        todoComment: `TODO: handle malformed URI input for this ${fnName}(...) call.`,
                        errorPrefix: `${fnName} failed: `,
                      })
                    );
                  },
                },
              ]
            : [],
        });
      },
    };
  },
});
