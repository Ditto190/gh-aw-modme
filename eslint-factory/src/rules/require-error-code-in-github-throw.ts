import { AST_NODE_TYPES, ESLintUtils, TSESTree } from "@typescript-eslint/utils";
import { CORE_ALIASES } from "./core-aliases";

const createRule = ESLintUtils.RuleCreator(name => `https://github.com/github/gh-aw/tree/main/eslint-factory#${name}`);

/** Matches identifier-style references to error code constants (ERR_*, ERROR_*, or a legacy E### code) anywhere in a module's source text. Mirrors the USE-001 heuristic in scripts/check-safe-outputs-conformance.sh (`E[0-9]{3}|ERROR_|ERR_`). */
const ERROR_CODE_REFERENCE_PATTERN = /E[0-9]{3}|ERROR_|ERR_/;

/** Returns true when the callee/text references octokit, safe-output handling, or NDJSON — signals of GitHub API / safe-outputs interaction relevant to USE-001. */
function isGithubApiIndicator(text: string): boolean {
  return /\boctokit\.|safe_output|safeOutput|\bNDJSON\b/.test(text);
}

/** Returns true if the callee of `node` is `core.setFailed` (or a recognized core alias). */
function isCoreSetFailedCall(node: TSESTree.CallExpression): boolean {
  const callee = node.callee;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed) return false;
  const obj = callee.object;
  const prop = callee.property;
  if (obj.type !== AST_NODE_TYPES.Identifier || !CORE_ALIASES.has(obj.name)) return false;
  return prop.type === AST_NODE_TYPES.Identifier && prop.name === "setFailed";
}

/** Returns true if `node` is `throw new Error(...)` / `throw new SomeError(...)`. */
function isThrowNewError(node: TSESTree.ThrowStatement): boolean {
  const arg = node.argument;
  return arg !== null && arg.type === AST_NODE_TYPES.NewExpression;
}

export const requireErrorCodeInGithubThrowRule = createRule({
  name: "require-error-code-in-github-throw",
  meta: {
    type: "problem",
    hasSuggestions: false,
    docs: {
      description:
        "Require modules that interact with the GitHub API or safe-outputs and throw errors / call core.setFailed() to reference at least one standardized error code from error_codes.cjs (ERR_VALIDATION, ERR_API, ERR_NOT_FOUND, etc.) somewhere in the file. " +
        "Uncoded error messages cannot be grepped or alerted on consistently in logs and monitoring dashboards. This mirrors the repo's USE-001 safe-outputs conformance check (scripts/check-safe-outputs-conformance.sh), turning a nightly external audit into an immediate lint failure.",
    },
    schema: [],
    messages: {
      missingErrorCode:
        "This module interacts with the GitHub API or safe-outputs and throws/reports errors, but never references a standardized error code from \"./error_codes.cjs\" (e.g. ERR_API, ERR_NOT_FOUND, ERR_VALIDATION). Import one and prefix thrown/reported messages, e.g. `${ERR_API}: ...`. See USE-001 in scripts/check-safe-outputs-conformance.sh.",
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode;
    const fullText = sourceCode.getText();

    // Only applies to modules that actually talk to the GitHub API or safe-outputs
    // pipeline — plain utility modules are out of scope (matches USE-001 heuristic).
    if (!isGithubApiIndicator(fullText)) return {};

    // If the module already references an error code (via error_codes.cjs import or an
    // inline E### style code), it has adopted the convention — even if not every single
    // throw site uses a code yet. Per-site enforcement is left to code review to avoid
    // excessive noise on large handlers that already use codes for their primary error
    // paths. This mirrors the file-level granularity of the USE-001 conformance check.
    if (ERROR_CODE_REFERENCE_PATTERN.test(fullText)) return {};

    const reportedNodes = new Set<TSESTree.Node>();

    function reportOnce(node: TSESTree.Node) {
      if (reportedNodes.has(node)) return;
      reportedNodes.add(node);
      context.report({ node, messageId: "missingErrorCode" });
    }

    /**
     * Looks for `<name>.message = <expr>` as a statement immediately preceding
     * `throwNode` within the same block, or nested inside a guard `if (...) { ... }`
     * (with no `else`) that immediately precedes it — the re-throw-with-prefixed-message
     * pattern seen in dismiss_pull_request_review.cjs. Returns the assigned
     * expression node, or null if no such assignment exists.
     */
    function findPrecedingMessageAssignment(throwNode: TSESTree.ThrowStatement, varName: string): TSESTree.Expression | null {
      const parent = throwNode.parent;
      if (!parent || parent.type !== AST_NODE_TYPES.BlockStatement) return null;
      const idx = parent.body.indexOf(throwNode);
      if (idx <= 0) return null;
      for (let i = idx - 1; i >= 0; i--) {
        const stmt = parent.body[i];
        const found = findMessageAssignmentInStatement(stmt, varName);
        if (found) return found;
      }
      return null;
    }

    /** Returns the assigned expression for `<varName>.message = <expr>` within `stmt`, descending into a single-branch (no-`else`) `if` guard's block body. */
    function findMessageAssignmentInStatement(stmt: TSESTree.Statement, varName: string): TSESTree.Expression | null {
      if (stmt.type === AST_NODE_TYPES.ExpressionStatement) {
        const expr = stmt.expression;
        if (expr.type !== AST_NODE_TYPES.AssignmentExpression) return null;
        const left = expr.left;
        if (left.type !== AST_NODE_TYPES.MemberExpression || left.computed) return null;
        if (left.object.type !== AST_NODE_TYPES.Identifier || left.object.name !== varName) return null;
        if (left.property.type !== AST_NODE_TYPES.Identifier || left.property.name !== "message") return null;
        return expr.right;
      }
      if (stmt.type === AST_NODE_TYPES.IfStatement && !stmt.alternate && stmt.consequent.type === AST_NODE_TYPES.BlockStatement) {
        const body = stmt.consequent.body;
        if (body.length === 0) return null;
        // Only consider the guard's last statement to avoid unrelated earlier statements.
        return findMessageAssignmentInStatement(body[body.length - 1], varName);
      }
      return null;
    }

    return {
      ThrowStatement(node) {
        if (isThrowNewError(node)) {
          reportOnce(node);
          return;
        }
        // Re-throw of a caught/local variable whose `.message` was reassigned with a
        // plain (uncoded) string/template immediately beforehand.
        const arg = node.argument;
        if (arg === null || arg.type !== AST_NODE_TYPES.Identifier) return;
        const assignedMessage = findPrecedingMessageAssignment(node, arg.name);
        if (!assignedMessage) return;
        if (ERROR_CODE_REFERENCE_PATTERN.test(sourceCode.getText(assignedMessage))) return;
        reportOnce(assignedMessage);
      },
      CallExpression(node) {
        if (!isCoreSetFailedCall(node)) return;
        reportOnce(node);
      },
    };
  },
});
