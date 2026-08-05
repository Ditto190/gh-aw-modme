import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { requireDateValidityCheckRule } from "./require-date-validity-check";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "commonjs",
  },
});

describe("require-date-validity-check", () => {
  it("invalid: inline new Date(x) compared with relational operators", () => {
    ruleTester.run("require-date-validity-check", requireDateValidityCheckRule, {
      valid: [],
      invalid: [
        {
          code: `if (new Date(run.started_at) > new Date(existing.started_at)) {}`,
          errors: [{ messageId: "requireValidityCheck" }],
        },
        {
          code: `if (new Date(run.created_at) < threshold) {}`,
          errors: [{ messageId: "requireValidityCheck" }],
        },
      ],
    });
  });

  it("invalid: variable holding a dynamic Date compared without validation", () => {
    ruleTester.run("require-date-validity-check", requireDateValidityCheckRule, {
      valid: [],
      invalid: [
        {
          code: `const runCreatedAt = new Date(run.created_at); if (runCreatedAt < thresholdTime) {}`,
          errors: [{ messageId: "requireValidityCheck" }],
        },
      ],
    });
  });

  it("valid: variable validated with Number.isNaN(x.getTime()) before comparison", () => {
    ruleTester.run("require-date-validity-check", requireDateValidityCheckRule, {
      valid: [
        `const d = new Date(input); if (!Number.isNaN(d.getTime())) { if (d < other) {} }`,
        `const d = new Date(input); if (!isNaN(d.getTime())) { if (d < other) {} }`,
      ],
      invalid: [],
    });
  });

  it("valid: Date constructed from Date.now() or numeric literal is always valid", () => {
    ruleTester.run("require-date-validity-check", requireDateValidityCheckRule, {
      valid: [`if (new Date(Date.now()) > new Date(0)) {}`, `if (new Date() > someOtherDate) {}`],
      invalid: [],
    });
  });

  it("valid: equality comparisons are out of scope", () => {
    ruleTester.run("require-date-validity-check", requireDateValidityCheckRule, {
      valid: [`if (new Date(run.created_at) === new Date(run.updated_at)) {}`],
      invalid: [],
    });
  });
});
