import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { requireDecodeUriTryCatchRule } from "./require-decode-uri-try-catch";

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

describe("require-decode-uri-try-catch", () => {
  it("valid: decodeURIComponent/decodeURI with string literal is always safe (CommonJS)", () => {
    cjsRuleTester.run("require-decode-uri-try-catch", requireDecodeUriTryCatchRule, {
      valid: [
        `const s = decodeURIComponent("%20");`,
        `const s = decodeURI("https://github.com/a%20b");`,
        `const s = decodeURIComponent(\`%20\`);`,
        `const s = decodeURIComponent("%2F" + "%2F");`,
      ],
      invalid: [],
    });
  });

  it("valid: decodeURIComponent inside try block passes (CommonJS)", () => {
    cjsRuleTester.run("require-decode-uri-try-catch", requireDecodeUriTryCatchRule, {
      valid: [
        `try { const s = decodeURIComponent(raw); } catch (e) {}`,
        `try { return decodeURIComponent(raw); } catch (e) {}`,
        `function f() { try { decodeURIComponent(raw); } catch (e) {} }`,
        `try { const s = decodeURI(process.env.GH_AW_URI); } catch (e) {}`,
      ],
      invalid: [],
    });
  });

  it("valid: decodeURIComponent inside try block passes (ES module)", () => {
    esmRuleTester.run("require-decode-uri-try-catch", requireDecodeUriTryCatchRule, {
      valid: [`try { const s = decodeURIComponent(raw); } catch (e) {}`],
      invalid: [],
    });
  });

  it("valid: decodeURIComponent shadowed by a local binding is not the global function (CommonJS)", () => {
    cjsRuleTester.run("require-decode-uri-try-catch", requireDecodeUriTryCatchRule, {
      valid: [
        // decodeURIComponent is a parameter — not the global; should not flag
        `function parse(decodeURIComponent, value) { return decodeURIComponent(value); }`,
        // decodeURIComponent is locally imported/assigned
        `const decodeURIComponent = require("./my-decoder"); const s = decodeURIComponent(variable);`,
      ],
      invalid: [],
    });
  });

  it("invalid: bare decodeURIComponent(variable) reports requireTryCatch (CommonJS)", () => {
    cjsRuleTester.run("require-decode-uri-try-catch", requireDecodeUriTryCatchRule, {
      valid: [],
      invalid: [
        {
          // ExpressionStatement — suggestion is safe (no bindings go out of scope)
          code: `decodeURIComponent(raw);`,
          errors: [
            {
              messageId: "requireTryCatch",
              data: { fn: "decodeURIComponent", arg: "raw" },
              suggestions: [
                {
                  messageId: "wrapInTryCatch",
                  output: `try {\n  decodeURIComponent(raw);\n} catch (err) {\n  // TODO: handle malformed URI input for this decodeURIComponent(...) call.\n  throw new Error(\n    "decodeURIComponent failed: " + (err instanceof Error ? err.message : String(err)),\n    { cause: err },\n  );\n}`,
                },
              ],
            },
          ],
        },
        {
          // VariableDeclaration — error is reported but no suggestion (wrapping would put
          // subsequent uses of `s` out of scope).
          code: `const s = decodeURIComponent(raw);`,
          errors: [
            {
              messageId: "requireTryCatch",
              data: { fn: "decodeURIComponent", arg: "raw" },
            },
          ],
        },
      ],
    });
  });

  it("invalid: decodeURI(process.env.VAR) without fallback (CommonJS)", () => {
    cjsRuleTester.run("require-decode-uri-try-catch", requireDecodeUriTryCatchRule, {
      valid: [],
      invalid: [
        {
          // VariableDeclaration — no suggestion (wrapping would put `s` out of scope)
          code: `const s = decodeURI(process.env.GH_AW_URI);`,
          errors: [
            {
              messageId: "requireTryCatch",
              data: { fn: "decodeURI", arg: "process.env.GH_AW_URI" },
            },
          ],
        },
      ],
    });
  });

  it("invalid: decodeURIComponent with template literal containing expressions (CommonJS)", () => {
    cjsRuleTester.run("require-decode-uri-try-catch", requireDecodeUriTryCatchRule, {
      valid: [],
      invalid: [
        {
          // VariableDeclaration — no suggestion
          code: "const s = decodeURIComponent(`${raw}`);",
          errors: [
            {
              messageId: "requireTryCatch",
            },
          ],
        },
      ],
    });
  });

  it("invalid: decodeURIComponent with string concatenation containing variables (CommonJS)", () => {
    cjsRuleTester.run("require-decode-uri-try-catch", requireDecodeUriTryCatchRule, {
      valid: [],
      invalid: [
        {
          code: `const s = decodeURIComponent(prefix + "x");`,
          errors: [
            {
              messageId: "requireTryCatch",
              data: { fn: "decodeURIComponent", arg: 'prefix + "x"' },
            },
          ],
        },
      ],
    });
  });

  it("invalid: decodeURIComponent reports in ES module", () => {
    esmRuleTester.run("require-decode-uri-try-catch", requireDecodeUriTryCatchRule, {
      valid: [],
      invalid: [
        {
          // VariableDeclaration — no suggestion
          code: `const s = decodeURIComponent(raw);`,
          errors: [
            {
              messageId: "requireTryCatch",
              data: { fn: "decodeURIComponent", arg: "raw" },
            },
          ],
        },
      ],
    });
  });

  it("invalid: decodeURIComponent in arrow-expression body has no wrappable ancestor — no suggestion emitted (CommonJS)", () => {
    cjsRuleTester.run("require-decode-uri-try-catch", requireDecodeUriTryCatchRule, {
      valid: [],
      invalid: [
        {
          // Arrow expression body is not a statement — findEnclosingStatement returns null, so suggestions is []
          code: `const f = () => decodeURIComponent(raw);`,
          errors: [{ messageId: "requireTryCatch", suggestions: [] }],
        },
      ],
    });
  });

  it("invalid: decodeURIComponent inside setTimeout callback is not protected by outer try (CommonJS)", () => {
    cjsRuleTester.run("require-decode-uri-try-catch", requireDecodeUriTryCatchRule, {
      valid: [],
      invalid: [
        {
          // The outer try does NOT protect the decodeURIComponent call: isDeferredCallback detects the
          // setTimeout boundary and crossedDeferredBoundary = true.
          code: `try { setTimeout(() => { decodeURIComponent(raw); }, 0); } catch(e) {}`,
          errors: [
            {
              messageId: "requireTryCatch",
              suggestions: [
                {
                  messageId: "wrapInTryCatch",
                  output: `try { setTimeout(() => { try {\n  decodeURIComponent(raw);\n} catch (err) {\n  // TODO: handle malformed URI input for this decodeURIComponent(...) call.\n  throw new Error(\n    "decodeURIComponent failed: " + (err instanceof Error ? err.message : String(err)),\n    { cause: err },\n  );\n} }, 0); } catch(e) {}`,
                },
              ],
            },
          ],
        },
      ],
    });
  });
});
