import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noPromiseCatchEmptyBodyRule } from "./no-promise-catch-empty-body";

const cjsRuleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "commonjs",
  },
});

describe("no-promise-catch-empty-body", () => {
  it("valid: .catch with a handler body is not flagged", () => {
    cjsRuleTester.run("no-promise-catch-empty-body", noPromiseCatchEmptyBodyRule, {
      valid: [
        `p.catch(err => { console.error(err); });`,
        `p.catch(err => { core.warning(getErrorMessage(err)); });`,
        `p.catch(err => core.setFailed(getErrorMessage(err)));`,
        `p.catch(function(err) { console.error(err); });`,
        // Non-catch method — not flagged
        `p.then(() => {});`,
        // catch with no parameter but non-empty body
        `p.catch(() => { core.info("handled"); });`,
      ],
      invalid: [],
    });
  });

  it("invalid: .catch(() => {}) is flagged", () => {
    cjsRuleTester.run("no-promise-catch-empty-body", noPromiseCatchEmptyBodyRule, {
      valid: [],
      invalid: [
        {
          code: `run().catch(() => {});`,
          errors: [{ messageId: "emptyBody" }],
        },
        {
          code: `fetch(url).then(r => r.json()).catch(() => {});`,
          errors: [{ messageId: "emptyBody" }],
        },
        {
          code: `p.catch(function() {});`,
          errors: [{ messageId: "emptyBody" }],
        },
      ],
    });
  });

  it("invalid: .catch with undefined/void expression body is flagged", () => {
    cjsRuleTester.run("no-promise-catch-empty-body", noPromiseCatchEmptyBodyRule, {
      valid: [],
      invalid: [
        {
          code: `p.catch(() => undefined);`,
          errors: [{ messageId: "emptyBody" }],
        },
        {
          code: `p.catch(() => void 0);`,
          errors: [{ messageId: "emptyBody" }],
        },
      ],
    });
  });
});
