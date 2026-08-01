import { RuleTester } from "eslint";
import { describe, expect, it } from "vitest";
import { noCoreSetFailedNonStringRule } from "./no-core-setfailed-non-string";

const cjsRuleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "commonjs",
  },
});

describe("no-core-setfailed-non-string", () => {
  it("uses the correct docs URL", () => {
    expect(noCoreSetFailedNonStringRule.meta.docs.url).toBe("https://github.com/github/gh-aw/tree/main/eslint-factory#no-core-setfailed-non-string");
  });

  it("valid: string literal / string-producing values are accepted", () => {
    cjsRuleTester.run("no-core-setfailed-non-string", noCoreSetFailedNonStringRule, {
      valid: [
        `core.setFailed("Something went wrong");`,
        `core.setFailed(message);`,
        `core.setFailed(getErrorMessage(error));`,
        `core.setFailed(String(items.length));`,
        `core.setFailed(items.length.toString());`,
        `core.setFailed(\`Failed: \${items.length}\`);`,
        `core.setFailed(err && err.stack ? err.stack : String(err));`,
      ],
      invalid: [],
    });
  });

  it("valid: non-core.setFailed calls are not flagged", () => {
    cjsRuleTester.run("no-core-setfailed-non-string", noCoreSetFailedNonStringRule, {
      valid: [`other.setFailed(0);`, `setFailed(0);`, `myCore.setFailed(0);`],
      invalid: [],
    });
  });

  it("valid: coreObj alias with string value is accepted", () => {
    cjsRuleTester.run("no-core-setfailed-non-string", noCoreSetFailedNonStringRule, {
      valid: [`coreObj.setFailed(errorMessage);`, `coreObj.setFailed("hello");`],
      invalid: [],
    });
  });

  it("valid: computed string-literal setFailed with string value is accepted", () => {
    cjsRuleTester.run("no-core-setfailed-non-string", noCoreSetFailedNonStringRule, {
      valid: [`core["setFailed"]("boom");`],
      invalid: [],
    });
  });

  it("invalid: numeric literal value is flagged", () => {
    cjsRuleTester.run("no-core-setfailed-non-string", noCoreSetFailedNonStringRule, {
      valid: [],
      invalid: [
        {
          code: `core.setFailed(0);`,
          errors: [
            {
              messageId: "nonStringValue",
              data: { kind: "numeric literal", valueText: "0" },
              suggestions: [{ messageId: "wrapWithString", data: { valueText: "0" }, output: `core.setFailed(String(0));` }],
            },
          ],
        },
        {
          code: `core.setFailed(42);`,
          errors: [
            {
              messageId: "nonStringValue",
              suggestions: [{ messageId: "wrapWithString", output: `core.setFailed(String(42));` }],
            },
          ],
        },
      ],
    });
  });

  it("invalid: boolean literal value is flagged", () => {
    cjsRuleTester.run("no-core-setfailed-non-string", noCoreSetFailedNonStringRule, {
      valid: [],
      invalid: [
        {
          code: `core.setFailed(true);`,
          errors: [
            {
              messageId: "nonStringValue",
              data: { kind: "boolean literal", valueText: "true" },
              suggestions: [{ messageId: "wrapWithString", data: { valueText: "true" }, output: `core.setFailed(String(true));` }],
            },
          ],
        },
        {
          code: `core.setFailed(false);`,
          errors: [
            {
              messageId: "nonStringValue",
              suggestions: [{ messageId: "wrapWithString", output: `core.setFailed(String(false));` }],
            },
          ],
        },
      ],
    });
  });

  it("invalid: null literal value is flagged with empty-string suggestion first", () => {
    cjsRuleTester.run("no-core-setfailed-non-string", noCoreSetFailedNonStringRule, {
      valid: [],
      invalid: [
        {
          code: `core.setFailed(null);`,
          errors: [
            {
              messageId: "nonStringValue",
              data: { kind: "null", valueText: "null" },
              suggestions: [
                { messageId: "useEmptyString", output: `core.setFailed("");` },
                { messageId: "wrapWithString", output: `core.setFailed(String(null));` },
              ],
            },
          ],
        },
      ],
    });
  });

  it("invalid: undefined identifier value is flagged with empty-string suggestion first", () => {
    cjsRuleTester.run("no-core-setfailed-non-string", noCoreSetFailedNonStringRule, {
      valid: [],
      invalid: [
        {
          code: `core.setFailed(undefined);`,
          errors: [
            {
              messageId: "nonStringValue",
              data: { kind: "undefined", valueText: "undefined" },
              suggestions: [
                { messageId: "useEmptyString", output: `core.setFailed("");` },
                { messageId: "wrapWithString", output: `core.setFailed(String(undefined));` },
              ],
            },
          ],
        },
      ],
    });
  });

  it("invalid: .length member access value is flagged", () => {
    cjsRuleTester.run("no-core-setfailed-non-string", noCoreSetFailedNonStringRule, {
      valid: [],
      invalid: [
        {
          code: `core.setFailed(errors.length);`,
          errors: [
            {
              messageId: "nonStringValue",
              data: { kind: ".length (number)", valueText: "errors.length" },
              suggestions: [{ messageId: "wrapWithString", data: { valueText: "errors.length" }, output: `core.setFailed(String(errors.length));` }],
            },
          ],
        },
      ],
    });
  });

  it("valid: alias assignment (const c = core) with string value is accepted", () => {
    cjsRuleTester.run("no-core-setfailed-non-string", noCoreSetFailedNonStringRule, {
      valid: [`const c = core; c.setFailed("hi");`],
      invalid: [],
    });
  });

  it("invalid: alias assignment (const c = core) with non-string value is flagged", () => {
    cjsRuleTester.run("no-core-setfailed-non-string", noCoreSetFailedNonStringRule, {
      valid: [],
      invalid: [
        {
          code: `const c = core; c.setFailed(errors.length);`,
          errors: [{ messageId: "nonStringValue", suggestions: [{ messageId: "wrapWithString", output: `const c = core; c.setFailed(String(errors.length));` }] }],
        },
      ],
    });
  });

  it("invalid: destructured setFailed with non-string value is flagged", () => {
    cjsRuleTester.run("no-core-setfailed-non-string", noCoreSetFailedNonStringRule, {
      valid: [],
      invalid: [
        {
          code: `const { setFailed } = core; setFailed(errors.length);`,
          errors: [{ messageId: "nonStringValue", suggestions: [{ messageId: "wrapWithString", output: `const { setFailed } = core; setFailed(String(errors.length));` }] }],
        },
        {
          code: `const { setFailed } = core; setFailed(true);`,
          errors: [{ messageId: "nonStringValue", suggestions: [{ messageId: "wrapWithString", output: `const { setFailed } = core; setFailed(String(true));` }] }],
        },
        {
          code: `const { setFailed: sf } = core; sf(errors.length);`,
          errors: [{ messageId: "nonStringValue", suggestions: [{ messageId: "wrapWithString", output: `const { setFailed: sf } = core; sf(String(errors.length));` }] }],
        },
      ],
    });
  });

  it("valid: standalone setFailed identifier from non-core source is NOT flagged", () => {
    cjsRuleTester.run("no-core-setfailed-non-string", noCoreSetFailedNonStringRule, {
      valid: [`function setFailed(v) {} setFailed(1);`, `const { setFailed } = other; setFailed(1);`],
      invalid: [],
    });
  });

  it("valid: function parameter with core-alias name and string value is accepted", () => {
    cjsRuleTester.run("no-core-setfailed-non-string", noCoreSetFailedNonStringRule, {
      valid: [`function f(core) { core.setFailed("str"); }`, `function f(core) { core.setFailed(someVariable); }`, `function f(coreObj) { coreObj.setFailed("str"); }`],
      invalid: [],
    });
  });

  it("invalid: function parameter with core-alias name and non-string value is flagged", () => {
    cjsRuleTester.run("no-core-setfailed-non-string", noCoreSetFailedNonStringRule, {
      valid: [],
      invalid: [
        {
          code: `function f(core) { core.setFailed(errors.length); }`,
          errors: [{ messageId: "nonStringValue", suggestions: [{ messageId: "wrapWithString", output: `function f(core) { core.setFailed(String(errors.length)); }` }] }],
        },
        {
          code: `function f(coreObj) { coreObj.setFailed(true); }`,
          errors: [{ messageId: "nonStringValue", suggestions: [{ messageId: "wrapWithString", output: `function f(coreObj) { coreObj.setFailed(String(true)); }` }] }],
        },
      ],
    });
  });

  it("valid: function parameter not in CORE_ALIASES is not treated as core (shadow-exclusion)", () => {
    cjsRuleTester.run("no-core-setfailed-non-string", noCoreSetFailedNonStringRule, {
      valid: [
        // `coreArg` is not in CORE_ALIASES — must not be treated as a core object
        `function f(coreArg) { coreArg.setFailed(0); }`,
        `function f(myCore) { myCore.setFailed(0); }`,
      ],
      invalid: [],
    });
  });

  it("valid: multi-argument setFailed calls are ignored (unexpected signature)", () => {
    cjsRuleTester.run("no-core-setfailed-non-string", noCoreSetFailedNonStringRule, {
      valid: [`core.setFailed(0, "extra");`, `core.setFailed();`],
      invalid: [],
    });
  });
});
