import { RuleTester } from "eslint";
import { describe, expect, it } from "vitest";
import { noUnguardedNumberEnvReadRule } from "./no-unguarded-number-env-read";

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "commonjs",
  },
});

describe("no-unguarded-number-env-read", () => {
  it("uses the correct docs URL", () => {
    expect(noUnguardedNumberEnvReadRule.meta.docs.url).toBe(
      "https://github.com/github/gh-aw/tree/main/eslint-factory#no-unguarded-number-env-read",
    );
  });

  it("valid: Number.isFinite guard follows immediately", () => {
    ruleTester.run("no-unguarded-number-env-read", noUnguardedNumberEnvReadRule, {
      valid: [
        `function f() {
          const ms = Number(process.env.TIMEOUT_MS);
          if (!Number.isFinite(ms) || ms <= 0) return null;
          doSomething(ms);
        }`,
        `function f() {
          const threshold = Number(process.env.THRESHOLD);
          if (!Number.isFinite(threshold)) throw new Error("bad threshold");
          useThreshold(threshold);
        }`,
        `function f() {
          const n = Number(env.GH_AW_TIMEOUT_MINUTES);
          if (!Number.isFinite(n) || n <= 0) { return null; }
          return n * 60 * 1000;
        }`,
      ],
      invalid: [],
    });
  });

  it("valid: Number.isNaN guard follows", () => {
    ruleTester.run("no-unguarded-number-env-read", noUnguardedNumberEnvReadRule, {
      valid: [
        `function f() {
          const port = Number(process.env.PORT);
          if (Number.isNaN(port)) return null;
          listen(port);
        }`,
        `function f() {
          const p = Number(env.PORT);
          if (isNaN(p)) return null;
          return p;
        }`,
      ],
      invalid: [],
    });
  });

  it("valid: Number(process.env.X || fallback) — fallback prevents NaN", () => {
    ruleTester.run("no-unguarded-number-env-read", noUnguardedNumberEnvReadRule, {
      valid: [
        `{ const runId = Number(process.env.GITHUB_RUN_ID || 0); doSomething(runId); }`,
      ],
      invalid: [],
    });
  });

  it("valid: Number() called on a non-env source is not flagged", () => {
    ruleTester.run("no-unguarded-number-env-read", noUnguardedNumberEnvReadRule, {
      valid: [
        `{ const n = Number(someString); doSomething(n); }`,
        `{ const n = Number(config.timeout); doSomething(n); }`,
      ],
      invalid: [],
    });
  });

  it("valid: guard in a logical expression condition", () => {
    ruleTester.run("no-unguarded-number-env-read", noUnguardedNumberEnvReadRule, {
      valid: [
        `function f() {
          const x = Number(process.env.FOO);
          if (Number.isFinite(x) && x > 0) { use(x); }
        }`,
      ],
      invalid: [],
    });
  });

  it("invalid: Number(process.env.X) with no guard", () => {
    ruleTester.run("no-unguarded-number-env-read", noUnguardedNumberEnvReadRule, {
      valid: [],
      invalid: [
        {
          code: `function f() {
            const ms = Number(process.env.TIMEOUT_MS);
            doSomething(ms);
          }`,
          errors: [{ messageId: "missingGuard" }],
        },
        {
          code: `function f() {
            const threshold = Number(process.env.THRESHOLD);
            return threshold * 2;
          }`,
          errors: [{ messageId: "missingGuard" }],
        },
      ],
    });
  });

  it("invalid: Number(env.X) with no guard", () => {
    ruleTester.run("no-unguarded-number-env-read", noUnguardedNumberEnvReadRule, {
      valid: [],
      invalid: [
        {
          code: `function f() {
            const timeout = Number(env.GH_AW_TIMEOUT_MINUTES);
            setTimeout(cb, timeout * 60 * 1000);
          }`,
          errors: [{ messageId: "missingGuard" }],
        },
      ],
    });
  });

  it("invalid: Number(process.env.X) is the last statement in block — no guard possible", () => {
    ruleTester.run("no-unguarded-number-env-read", noUnguardedNumberEnvReadRule, {
      valid: [],
      invalid: [
        {
          code: `function f() {
            const n = Number(process.env.FOO);
          }`,
          errors: [{ messageId: "missingGuard" }],
        },
      ],
    });
  });
});
