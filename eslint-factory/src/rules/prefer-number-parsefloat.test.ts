import { RuleTester } from "eslint";
import { describe, expect, it } from "vitest";
import { preferNumberParseFloatRule } from "./prefer-number-parsefloat";

const cjsRuleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "commonjs",
  },
});

const esmRuleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

describe("prefer-number-parsefloat", () => {
  it("uses the correct docs URL", () => {
    expect(preferNumberParseFloatRule.meta.docs.url).toBe("https://github.com/github/gh-aw/tree/main/eslint-factory#prefer-number-parsefloat");
  });

  it("valid: Number.parseFloat is accepted", () => {
    cjsRuleTester.run("prefer-number-parsefloat", preferNumberParseFloatRule, {
      valid: [`Number.parseFloat("3.14");`, `Number["parseFloat"]("3.14");`, `foo.parseFloat("3.14");`],
      invalid: [],
    });
  });

  it("valid: locally shadowed parseFloat binding is intentionally excluded", () => {
    esmRuleTester.run("prefer-number-parsefloat", preferNumberParseFloatRule, {
      valid: [
        `function parseFloat(x) { return x; } parseFloat("3.14");`,
        `const parseFloat = Number.parseFloat; parseFloat("3.14");`,
        `import { parseFloat } from "some-lib"; parseFloat("3.14");`,
      ],
      invalid: [],
    });
  });

  it("valid: parseFloat used as callback reference is not a CallExpression", () => {
    cjsRuleTester.run("prefer-number-parsefloat", preferNumberParseFloatRule, {
      valid: [`values.map(parseFloat);`],
      invalid: [],
    });
  });

  it("invalid: global parseFloat is autofixed when Number is not shadowed", () => {
    cjsRuleTester.run("prefer-number-parsefloat", preferNumberParseFloatRule, {
      valid: [],
      invalid: [
        {
          code: `const x = parseFloat("3.14");`,
          errors: [{ messageId: "preferNumberParseFloat" }],
          output: `const x = Number.parseFloat("3.14");`,
        },
        {
          code: `const y = parseFloat(str);`,
          errors: [{ messageId: "preferNumberParseFloat" }],
          output: `const y = Number.parseFloat(str);`,
        },
      ],
    });
  });

  it("invalid: global parseFloat when Number is shadowed yields suggestion-only", () => {
    esmRuleTester.run("prefer-number-parsefloat", preferNumberParseFloatRule, {
      valid: [],
      invalid: [
        {
          code: `import Number from "./custom-number"; const x = parseFloat("1.5");`,
          errors: [{ messageId: "preferNumberParseFloat", suggestions: [{ messageId: "replaceWithNumberParseFloat", output: `import Number from "./custom-number"; const x = Number.parseFloat("1.5");` }] }],
        },
      ],
    });
  });
});
