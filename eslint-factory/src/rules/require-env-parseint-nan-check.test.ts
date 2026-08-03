import { RuleTester } from "eslint";
import { describe, expect, it } from "vitest";
import { requireEnvParseIntNanCheckRule } from "./require-env-parseint-nan-check";

const cjsRuleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "commonjs",
  },
});

describe("require-env-parseint-nan-check", () => {
  it("uses the correct docs URL", () => {
    expect(requireEnvParseIntNanCheckRule.meta.docs.url).toBe("https://github.com/github/gh-aw/tree/main/eslint-factory#require-env-parseint-nan-check");
  });

  it("valid and invalid parseInt(process.env...) usages", () => {
    cjsRuleTester.run("require-env-parseint-nan-check", requireEnvParseIntNanCheckRule, {
      valid: [
        `
        const maxCount = parseInt(process.env.GH_AW_NOOP_MAX || "0", 10);
        if (!Number.isFinite(maxCount)) { throw new Error("bad"); }
        `,
        `
        const maxSizeKB = parseInt(process.env.GH_AW_ASSETS_MAX_SIZE_KB, 10);
        if (Number.isNaN(maxSizeKB)) { maxSizeKB = 10240; }
        `,
        `
        const count = Number.parseInt(process.env.COUNT || "1", 10);
        const ok = isFinite(count);
        `,
        // Not derived from process.env — out of scope
        `const n = parseInt(str, 10);`,
        // process.env not referenced anywhere in the argument
        `const n = parseInt(someVar, 10);`,
      ],
      invalid: [
        {
          code: `
          const maxFileSize = parseInt(process.env.MAX_FILE_SIZE || "10240", 10);
          if (stats.size > maxFileSize) { core.setFailed("too big"); }
          `,
          errors: [{ messageId: "requireNanCheck", data: { name: "maxFileSize" } }],
        },
        {
          code: `
          const maxSizeKB = process.env.GH_AW_ASSETS_MAX_SIZE_KB ? parseInt(process.env.GH_AW_ASSETS_MAX_SIZE_KB, 10) : 10240;
          if (sizeKB > maxSizeKB) { throw new Error("too big"); }
          `,
          errors: [{ messageId: "requireNanCheck", data: { name: "maxSizeKB" } }],
        },
        {
          code: `
          const maxCount = parseInt(process.env.GH_AW_NOOP_MAX || "0", 10);
          const items = maxCount > 0 ? all.slice(0, maxCount) : all;
          `,
          errors: [{ messageId: "requireNanCheck", data: { name: "maxCount" } }],
        },
      ],
    });
  });
});
