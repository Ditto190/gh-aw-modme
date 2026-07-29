import { ESLintUtils } from "@typescript-eslint/utils";
import { buildTryCatchSuggestion, createFsSyncMethodResolver, findEnclosingStatement, isInsideTryBlock } from "./try-catch-rule-utils";

const createRule = ESLintUtils.RuleCreator(name => `https://github.com/github/gh-aw/tree/main/eslint-factory#${name}`);

// fs.rmSync/fs.rmdirSync throw on permission errors (EACCES/EPERM) and other
// filesystem failures even when called with { force: true } — force only
// suppresses ENOENT, not permission or I/O errors. These calls appear
// unguarded in actions/setup/js (e.g. push_repo_memory.cjs, push_experiment_state.cjs)
// during cleanup of untrusted/checked-out directories, where an unhandled
// throw would crash the action mid-cleanup without a useful diagnostic.
const FS_SYNC_METHODS = new Set(["rmSync", "rmdirSync"]);

export const requireRmSyncTryCatchRule = createRule({
  name: "require-rmsync-try-catch",
  meta: {
    type: "problem",
    hasSuggestions: true,
    docs: {
      description:
        "Require fs.rmSync and fs.rmdirSync calls in actions/setup/js scripts to be wrapped in try/catch. " +
        "These methods throw on permission errors and other filesystem failures even with { force: true } " +
        "(force only suppresses ENOENT); an unhandled throw crashes the action without a useful diagnostic.",
    },
    schema: [],
    messages: {
      requireTryCatch: "Wrap fs.{{method}}({{arg}}) in try/catch — {{method}} can throw on permission denied or other filesystem errors " + "(force only suppresses missing-path errors) and will crash the action if unhandled.",
      wrapInTryCatch: "Wrap in try { ... } catch { ... } and re-throw with { cause: err } to preserve context.",
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode;
    const resolveFsSyncMethod = createFsSyncMethodResolver(sourceCode, FS_SYNC_METHODS, { allowUnboundFsIdentifier: true });

    return {
      CallExpression(node) {
        const methodName = resolveFsSyncMethod(node);

        if (!methodName) return;

        if (isInsideTryBlock(sourceCode, node)) return;

        const argText = node.arguments.length > 0 ? sourceCode.getText(node.arguments[0]) : "";
        const method = methodName;
        const stmt = findEnclosingStatement(sourceCode, node);

        context.report({
          node,
          messageId: "requireTryCatch",
          data: { method, arg: argText },
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
                        todoComment: `TODO: handle filesystem failure for this fs.${method} call.`,
                        errorPrefix: `fs.${method} failed: `,
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
