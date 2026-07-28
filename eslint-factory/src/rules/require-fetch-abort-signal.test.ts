import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { requireFetchAbortSignalRule } from "./require-fetch-abort-signal";

const cjsRuleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "commonjs",
  },
});

describe("require-fetch-abort-signal", () => {
  it("valid: fetch with signal option", () => {
    cjsRuleTester.run("require-fetch-abort-signal", requireFetchAbortSignalRule, {
      valid: [
        `fetch(url, { signal: AbortSignal.timeout(10000) })`,
        `fetch(url, { method: "POST", signal: ac.signal })`,
        `fetch(url, { "signal": ac.signal })`,
        `fetch(url, { signal })`,
      ],
      invalid: [],
    });
  });

  it("valid: no args or non-object options are not flagged (avoid false positives)", () => {
    cjsRuleTester.run("require-fetch-abort-signal", requireFetchAbortSignalRule, {
      valid: [`fetch()`, `fetch(url, opts)`, `fetch(url, ...spreadOpts)`, `fetch(url, { ...base })`],
      invalid: [],
    });
  });

  it("valid: non-fetch calls are ignored", () => {
    cjsRuleTester.run("require-fetch-abort-signal", requireFetchAbortSignalRule, {
      valid: [`myObj.fetch(url)`, `axios.get(url)`],
      invalid: [],
    });
  });

  it("invalid: fetch with no options object", () => {
    cjsRuleTester.run("require-fetch-abort-signal", requireFetchAbortSignalRule, {
      valid: [],
      invalid: [
        {
          code: `fetch(url)`,
          errors: [{ messageId: "requireAbortSignal" }],
        },
        {
          code: `fetch("https://example.com")`,
          errors: [{ messageId: "requireAbortSignal" }],
        },
      ],
    });
  });

  it("invalid: fetch with options object but no signal", () => {
    cjsRuleTester.run("require-fetch-abort-signal", requireFetchAbortSignalRule, {
      valid: [],
      invalid: [
        {
          code: `fetch(url, { method: "GET" })`,
          errors: [{ messageId: "requireAbortSignal" }],
        },
        {
          code: `fetch(url, { method: "POST", headers: headers, body: body })`,
          errors: [{ messageId: "requireAbortSignal" }],
        },
      ],
    });
  });
});
