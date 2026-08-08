import { RuleTester } from "eslint";
import { describe, expect, it } from "vitest";
import { requireGetExecOutputExitCodeCheckRule } from "./require-getexecoutput-exitcode-check";

const cjsRuleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "commonjs",
  },
});

describe("require-getexecoutput-exitcode-check", () => {
  it("uses the correct docs URL", () => {
    expect(requireGetExecOutputExitCodeCheckRule.meta.docs.url).toBe("https://github.com/github/gh-aw/tree/main/eslint-factory#require-getexecoutput-exitcode-check");
  });

  it("valid: exitCode is read after ignoreReturnCode: true", () => {
    cjsRuleTester.run("require-getexecoutput-exitcode-check", requireGetExecOutputExitCodeCheckRule, {
      valid: [
        // bare getExecOutput, checks result.exitCode
        `async function f() { const result = await getExecOutput("git", ["status"], { ignoreReturnCode: true }); if (result.exitCode !== 0) throw new Error("failed"); }`,
        // namespaced exec.getExecOutput, checks result.exitCode
        `async function f() { const result = await exec.getExecOutput("git", ["status"], { ignoreReturnCode: true }); if (result.exitCode !== 0) throw new Error("x"); }`,
        // execApi namespace
        `async function f() { const result = await execApi.getExecOutput("git", ["fetch"], { ignoreReturnCode: true }); return result.exitCode === 0; }`,
        // destructured binding includes exitCode
        `async function f() { const { exitCode, stdout } = await exec.getExecOutput("git", ["log"], { ignoreReturnCode: true }); if (exitCode !== 0) throw new Error(stdout); }`,
        // string-literal exitCode key in destructuring
        `async function f() { const { "exitCode": code } = await exec.getExecOutput("git", ["log"], { ignoreReturnCode: true }); return code; }`,
        // no ignoreReturnCode option: default throw-on-failure behavior applies, rule does not apply
        `async function f() { const result = await exec.getExecOutput("git", ["status"]); return result.stdout; }`,
        // ignoreReturnCode is false: default throwing behavior still applies
        `async function f() { const result = await exec.getExecOutput("git", ["status"], { ignoreReturnCode: false }); return result.stdout; }`,
        // options passed via spread or identifier can't be statically confirmed to set
        // ignoreReturnCode, so the rule conservatively does not require an exitCode check
        `async function f() { const result = await exec.getExecOutput("git", ["status"], ...opts); return result.stdout; }`,
        `async function f() { const result = await exec.getExecOutput("git", ["status"], options); return result.stdout; }`,
        // unrelated function named getExecOutput on an unknown namespace object is not flagged
        `async function f() { const result = await other.getExecOutput("git", ["status"], { ignoreReturnCode: true }); return result.stdout; }`,
        // result is returned as-is to the caller, who is expected to check exitCode
        `async function inner() { const result = await exec.getExecOutput("git", ["rebase"], { ignoreReturnCode: true }); return result; }`,
        `const inner = async () => { const result = await exec.getExecOutput("git", ["rebase"], { ignoreReturnCode: true }); return result; };`,
      ],
      invalid: [],
    });
  });

  it("invalid: ignoreReturnCode: true but exitCode never read", () => {
    cjsRuleTester.run("require-getexecoutput-exitcode-check", requireGetExecOutputExitCodeCheckRule, {
      valid: [],
      invalid: [
        {
          code: `async function f() { const result = await getExecOutput("git", ["status"], { ignoreReturnCode: true }); return result.stdout; }`,
          errors: [{ messageId: "missingExitCodeCheck" }],
        },
        {
          code: `async function f() { const result = await exec.getExecOutput("git", ["log"], { ignoreReturnCode: true }); core.info(result.stdout); }`,
          errors: [{ messageId: "missingExitCodeCheck" }],
        },
        {
          code: `async function f() { const { stdout, stderr } = await exec.getExecOutput("git", ["log"], { ignoreReturnCode: true }); core.info(stdout + stderr); }`,
          errors: [{ messageId: "missingExitCodeCheck" }],
        },
        {
          code: `async function f() { const result = await execApi.getExecOutput("git", ["fetch"], { ignoreReturnCode: true }); return result.stdout.trim(); }`,
          errors: [{ messageId: "missingExitCodeCheck" }],
        },
      ],
    });
  });
});
