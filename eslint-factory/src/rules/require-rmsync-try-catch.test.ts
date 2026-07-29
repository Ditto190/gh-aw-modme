import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { requireRmSyncTryCatchRule } from "./require-rmsync-try-catch";

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

describe("require-rmsync-try-catch", () => {
  it("valid: fs.rmSync/fs.rmdirSync inside try block passes (CommonJS)", () => {
    cjsRuleTester.run("require-rmsync-try-catch", requireRmSyncTryCatchRule, {
      valid: [
        `const fs = require("fs"); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}`,
        `const fs = require("fs"); try { fs.rmdirSync(dir); } catch (e) {}`,
        `const fs = require("fs"); function f() { try { fs.rmSync(dir, { recursive: true }); } catch (e) {} }`,
        `const fs = require("fs"); try { fs["rmSync"](dir, { recursive: true }); } catch (e) {}`,
      ],
      invalid: [],
    });
  });

  it("valid: destructured rmSync/rmdirSync inside try block passes", () => {
    cjsRuleTester.run("require-rmsync-try-catch", requireRmSyncTryCatchRule, {
      valid: [
        `const { rmSync } = require("fs"); try { rmSync(dir, { recursive: true, force: true }); } catch (e) {}`,
        `const { rmdirSync } = require("node:fs"); try { rmdirSync(dir); } catch (e) {}`,
      ],
      invalid: [],
    });
  });

  it("valid: non-fs receiver names are ignored", () => {
    cjsRuleTester.run("require-rmsync-try-catch", requireRmSyncTryCatchRule, {
      valid: [`mockFs.rmSync(dir, { recursive: true });`, `storage.rmdirSync(dir);`, `myObj.rmSync(path);`, `const fs = require("mock-fs"); fs.rmSync(dir, { recursive: true, force: true });`],
      invalid: [],
    });
  });

  it("valid: other fs methods remain out of scope", () => {
    cjsRuleTester.run("require-rmsync-try-catch", requireRmSyncTryCatchRule, {
      valid: [`fs.existsSync(path);`, `fs.unlinkSync(path);`, `fs.statSync(path);`, `fs.mkdirSync(dir, { recursive: true });`],
      invalid: [],
    });
  });

  it("invalid: bare fs.rmSync is flagged (CommonJS)", () => {
    cjsRuleTester.run("require-rmsync-try-catch", requireRmSyncTryCatchRule, {
      valid: [],
      invalid: [
        {
          code: `fs.rmSync(dir, { recursive: true, force: true });`,
          errors: [
            {
              messageId: "requireTryCatch",
              data: { method: "rmSync", arg: "dir" },
              suggestions: [
                {
                  messageId: "wrapInTryCatch",
                  output: `try {\n  fs.rmSync(dir, { recursive: true, force: true });\n} catch (err) {\n  // TODO: handle filesystem failure for this fs.rmSync call.\n  throw new Error(\n    "fs.rmSync failed: " + (err instanceof Error ? err.message : String(err)),\n    { cause: err },\n  );\n}`,
                },
              ],
            },
          ],
        },
        {
          code: `const fs = require("fs"); fs.rmSync(dir, { recursive: true, force: true });`,
          errors: [
            {
              messageId: "requireTryCatch",
              data: { method: "rmSync", arg: "dir" },
              suggestions: [
                {
                  messageId: "wrapInTryCatch",
                  output: `const fs = require("fs"); try {\n  fs.rmSync(dir, { recursive: true, force: true });\n} catch (err) {\n  // TODO: handle filesystem failure for this fs.rmSync call.\n  throw new Error(\n    "fs.rmSync failed: " + (err instanceof Error ? err.message : String(err)),\n    { cause: err },\n  );\n}`,
                },
              ],
            },
          ],
        },
        {
          code: `const fs = require("fs"); fs.rmSync(path.join(base, entry), { recursive: true, force: true });`,
          errors: [
            {
              messageId: "requireTryCatch",
              data: { method: "rmSync", arg: `path.join(base, entry)` },
              suggestions: [
                {
                  messageId: "wrapInTryCatch",
                  output: `const fs = require("fs"); try {\n  fs.rmSync(path.join(base, entry), { recursive: true, force: true });\n} catch (err) {\n  // TODO: handle filesystem failure for this fs.rmSync call.\n  throw new Error(\n    "fs.rmSync failed: " + (err instanceof Error ? err.message : String(err)),\n    { cause: err },\n  );\n}`,
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("invalid: bare fs.rmdirSync is flagged", () => {
    cjsRuleTester.run("require-rmsync-try-catch", requireRmSyncTryCatchRule, {
      valid: [],
      invalid: [
        {
          code: `fs.rmdirSync(tempDir);`,
          errors: [
            {
              messageId: "requireTryCatch",
              data: { method: "rmdirSync", arg: "tempDir" },
              suggestions: [
                {
                  messageId: "wrapInTryCatch",
                  output: `try {\n  fs.rmdirSync(tempDir);\n} catch (err) {\n  // TODO: handle filesystem failure for this fs.rmdirSync call.\n  throw new Error(\n    "fs.rmdirSync failed: " + (err instanceof Error ? err.message : String(err)),\n    { cause: err },\n  );\n}`,
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("invalid: destructured rmSync outside try is flagged", () => {
    cjsRuleTester.run("require-rmsync-try-catch", requireRmSyncTryCatchRule, {
      valid: [],
      invalid: [
        {
          code: `const { rmSync } = require("fs"); rmSync(dir, { recursive: true, force: true });`,
          errors: [
            {
              messageId: "requireTryCatch",
              data: { method: "rmSync", arg: "dir" },
              suggestions: [
                {
                  messageId: "wrapInTryCatch",
                  output: `const { rmSync } = require("fs"); try {\n  rmSync(dir, { recursive: true, force: true });\n} catch (err) {\n  // TODO: handle filesystem failure for this fs.rmSync call.\n  throw new Error(\n    "fs.rmSync failed: " + (err instanceof Error ? err.message : String(err)),\n    { cause: err },\n  );\n}`,
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("invalid: fs.rmSync in async function without try is flagged", () => {
    cjsRuleTester.run("require-rmsync-try-catch", requireRmSyncTryCatchRule, {
      valid: [],
      invalid: [
        {
          code: `const fs = require("fs"); async function run() { fs.rmSync(tmpDir, { recursive: true, force: true }); }`,
          errors: [
            {
              messageId: "requireTryCatch",
              data: { method: "rmSync", arg: "tmpDir" },
              suggestions: [
                {
                  messageId: "wrapInTryCatch",
                  output: `const fs = require("fs"); async function run() { try {\n  fs.rmSync(tmpDir, { recursive: true, force: true });\n} catch (err) {\n  // TODO: handle filesystem failure for this fs.rmSync call.\n  throw new Error(\n    "fs.rmSync failed: " + (err instanceof Error ? err.message : String(err)),\n    { cause: err },\n  );\n} }`,
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it("invalid: fs.rmSync inside try/finally without catch is flagged", () => {
    cjsRuleTester.run("require-rmsync-try-catch", requireRmSyncTryCatchRule, {
      valid: [],
      invalid: [
        {
          code: `const fs = require("fs"); try { fs.rmSync(dir, { recursive: true, force: true }); } finally { cleanup(); }`,
          errors: [
            {
              messageId: "requireTryCatch",
              data: { method: "rmSync", arg: "dir" },
              suggestions: 1,
            },
          ],
        },
      ],
    });
  });

  it("valid: fs.rmSync inside try block passes (ESM)", () => {
    esmRuleTester.run("require-rmsync-try-catch", requireRmSyncTryCatchRule, {
      valid: [`import * as fs from "fs"; try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}`],
      invalid: [],
    });
  });

  it("invalid: bare fs.rmSync is flagged (ESM)", () => {
    esmRuleTester.run("require-rmsync-try-catch", requireRmSyncTryCatchRule, {
      valid: [],
      invalid: [
        {
          code: `import * as fs from "fs"; fs.rmSync(dir, { recursive: true, force: true });`,
          errors: [
            {
              messageId: "requireTryCatch",
              data: { method: "rmSync", arg: "dir" },
              suggestions: [
                {
                  messageId: "wrapInTryCatch",
                  output: `import * as fs from "fs"; try {\n  fs.rmSync(dir, { recursive: true, force: true });\n} catch (err) {\n  // TODO: handle filesystem failure for this fs.rmSync call.\n  throw new Error(\n    "fs.rmSync failed: " + (err instanceof Error ? err.message : String(err)),\n    { cause: err },\n  );\n}`,
                },
              ],
            },
          ],
        },
        {
          code: `import { rmSync } from "fs"; rmSync(dir, { recursive: true, force: true });`,
          errors: [
            {
              messageId: "requireTryCatch",
              data: { method: "rmSync", arg: "dir" },
              suggestions: 1,
            },
          ],
        },
      ],
    });
  });
});
