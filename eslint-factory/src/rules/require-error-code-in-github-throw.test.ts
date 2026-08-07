import { RuleTester } from "eslint";
import { describe, expect, it } from "vitest";
import { requireErrorCodeInGithubThrowRule } from "./require-error-code-in-github-throw";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "commonjs",
  },
});

describe("require-error-code-in-github-throw", () => {
  it("uses the correct docs URL", () => {
    expect(requireErrorCodeInGithubThrowRule.meta.docs.url).toBe("https://github.com/github/gh-aw/tree/main/eslint-factory#require-error-code-in-github-throw");
  });

  it("is a problem-level rule with no suggestions", () => {
    expect(requireErrorCodeInGithubThrowRule.meta.type).toBe("problem");
    expect(requireErrorCodeInGithubThrowRule.meta.hasSuggestions).toBe(false);
  });

  ruleTester.run("require-error-code-in-github-throw", requireErrorCodeInGithubThrowRule, {
    valid: [
      // Module has no GitHub API / safe-output indicator at all — out of scope.
      `
      function doWork(x) {
        if (!x) throw new Error("missing x");
        return x;
      }
      `,
      // References the error code catalog somewhere in the file — convention adopted.
      `
      const { ERR_NOT_FOUND } = require("./error_codes.cjs");
      async function resolveNode(octokit, itemNumber) {
        const { data } = await octokit.rest.issues.get({ issue_number: itemNumber });
        if (!data.node_id) {
          throw new Error(\`\${ERR_NOT_FOUND}: Failed to resolve node id for #\${itemNumber}\`);
        }
        return data.node_id;
      }
      `,
      // core.setFailed but the file already references an error code elsewhere.
      `
      const { ERR_CONFIG } = require("./error_codes.cjs");
      async function main() {
        const octokit = getOctokit();
        if (!process.env.GH_AW_PROMPT) {
          core.setFailed(\`\${ERR_CONFIG}: GH_AW_PROMPT is not set\`);
          return;
        }
        await octokit.rest.issues.get({});
      }
      `,
      // A raw re-throw with no `new Error(...)`, no `.message` reassignment, and no
      // core.setFailed is not flagged.
      `
      async function fetchThing(octokit) {
        try {
          return await octokit.rest.repos.get({});
        } catch (err) {
          throw err;
        }
      }
      `,
      // Re-throw with a message reassignment (inside a guard `if`) that already embeds
      // an error code.
      `
      const { ERR_API } = require("./error_codes.cjs");
      async function fetchReview(octokit, reviewId) {
        try {
          return await octokit.rest.pulls.getReview({ review_id: reviewId });
        } catch (getReviewError) {
          if (getReviewError && typeof getReviewError.message === "string") {
            getReviewError.message = \`\${ERR_API}: Failed to fetch review \${reviewId}: \` + getReviewError.message;
          }
          throw getReviewError;
        }
      }
      `,
      // GitHub API interaction but no throw/setFailed at all — nothing to flag.
      `
      async function listIssues(octokit) {
        return octokit.rest.issues.list({});
      }
      `,
    ],
    invalid: [
      {
        // Mirrors actions/setup/js/add_labels.cjs:278 — GitHub API call, no error code
        // referenced anywhere in the module.
        code: `
        async function resolveNode(octokit, contextType, itemNumber) {
          const { data } = await octokit.rest.issues.get({ issue_number: itemNumber });
          if (!data.node_id) {
            throw new Error(\`Failed to resolve GraphQL node ID for \${contextType} #\${itemNumber}\`);
          }
          return data.node_id;
        }
        `,
        errors: [{ messageId: "missingErrorCode" }],
      },
      {
        // Mirrors actions/setup/js/dismiss_pull_request_review.cjs:248-251 — re-thrown
        // error whose message was reassigned (inside a guard `if`) without a
        // standardized code, and the module has not adopted the convention at all.
        code: `
        async function fetchReview(octokit, reviewId, owner, repo, pullRequestNumber) {
          try {
            return await octokit.rest.pulls.getReview({ review_id: reviewId });
          } catch (getReviewError) {
            if (getReviewError && typeof getReviewError.message === "string") {
              getReviewError.message = \`Failed to fetch review \${reviewId} on \${owner}/\${repo}#\${pullRequestNumber}: \` + getReviewError.message;
            }
            throw getReviewError;
          }
        }
        `,
        errors: [{ messageId: "missingErrorCode" }],
      },
      {
        // core.setFailed() without a standardized code anywhere in a module that talks
        // to the GitHub API.
        code: `
        async function main() {
          const octokit = getOctokit();
          await octokit.rest.issues.get({});
          if (!process.env.GH_AW_PROMPT) {
            core.setFailed("GH_AW_PROMPT is not set");
          }
        }
        `,
        errors: [{ messageId: "missingErrorCode" }],
      },
      {
        // safe-output modules (detected via `safeOutput` reference) are in scope too.
        code: `
        function recordSafeOutput(safeOutput) {
          if (!safeOutput.type) {
            throw new Error("Missing safe output type");
          }
        }
        `,
        errors: [{ messageId: "missingErrorCode" }],
      },
      {
        // Multiple uncoded throw/setFailed sites in the same file are each reported.
        code: `
        async function main() {
          const octokit = getOctokit();
          await octokit.rest.issues.get({});
          if (!process.env.A) {
            throw new Error("A is not set");
          }
          if (!process.env.B) {
            core.setFailed("B is not set");
          }
        }
        `,
        errors: [{ messageId: "missingErrorCode" }, { messageId: "missingErrorCode" }],
      },
    ],
  });
});
