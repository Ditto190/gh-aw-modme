import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import { noPrettyPrintedJsonlAppendRule } from "./no-pretty-printed-jsonl-append";

const cjsRuleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "commonjs",
  },
});

describe("no-pretty-printed-jsonl-append", () => {
  it("valid: appendFileSync with compact JSON.stringify (no indent arg)", () => {
    cjsRuleTester.run("no-pretty-printed-jsonl-append", noPrettyPrintedJsonlAppendRule, {
      valid: [
        `fs.appendFileSync(outputFile, JSON.stringify(entry) + "\\n");`,
        `fs.appendFileSync(outputFile, \`\${JSON.stringify(entry)}\\n\`);`,
        `fs.appendFileSync(outputFile, JSON.stringify(entry, null, 0) + "\\n");`,
        `fs.appendFileSync(outputFile, JSON.stringify(entry, null, "") + "\\n");`,
        `fs.appendFileSync(outputFile, JSON.stringify(entry, replacer) + "\\n");`,
      ],
      invalid: [],
    });
  });

  it("valid: pretty-printed JSON.stringify used with writeFileSync (not JSONL append) is out of scope", () => {
    cjsRuleTester.run("no-pretty-printed-jsonl-append", noPrettyPrintedJsonlAppendRule, {
      valid: [`fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\\n");`, `console.log(JSON.stringify(data, null, 2));`],
      invalid: [],
    });
  });

  it("invalid: appendFileSync with JSON.stringify(value, null, 2)", () => {
    cjsRuleTester.run("no-pretty-printed-jsonl-append", noPrettyPrintedJsonlAppendRule, {
      valid: [],
      invalid: [
        {
          code: `fs.appendFileSync(outputFile, JSON.stringify(entry, null, 2) + "\\n");`,
          errors: [{ messageId: "noPrettyPrintedAppend" }],
        },
      ],
    });
  });

  it("invalid: appendFileSync with JSON.stringify(value, null, \"  \") string indent", () => {
    cjsRuleTester.run("no-pretty-printed-jsonl-append", noPrettyPrintedJsonlAppendRule, {
      valid: [],
      invalid: [
        {
          code: `fs.appendFileSync(outputFile, JSON.stringify(entry, null, "  ") + "\\n");`,
          errors: [{ messageId: "noPrettyPrintedAppend" }],
        },
      ],
    });
  });

  it("invalid: appendFileSync with template literal wrapping pretty-printed stringify", () => {
    cjsRuleTester.run("no-pretty-printed-jsonl-append", noPrettyPrintedJsonlAppendRule, {
      valid: [],
      invalid: [
        {
          code: "fs.appendFileSync(outputFile, `${JSON.stringify(entry, null, 2)}\\n`);",
          errors: [{ messageId: "noPrettyPrintedAppend" }],
        },
      ],
    });
  });

  it("invalid: fs.promises.appendFile with pretty-printed stringify", () => {
    cjsRuleTester.run("no-pretty-printed-jsonl-append", noPrettyPrintedJsonlAppendRule, {
      valid: [],
      invalid: [
        {
          code: `fs.promises.appendFile(outputFile, JSON.stringify(entry, null, 2) + "\\n");`,
          errors: [{ messageId: "noPrettyPrintedAppend" }],
        },
      ],
    });
  });

  it("invalid: destructured appendFileSync with dynamic indent variable (cannot prove safe)", () => {
    cjsRuleTester.run("no-pretty-printed-jsonl-append", noPrettyPrintedJsonlAppendRule, {
      valid: [],
      invalid: [
        {
          code: `appendFileSync(outputFile, JSON.stringify(entry, null, indentLevel) + "\\n");`,
          errors: [{ messageId: "noPrettyPrintedAppend" }],
        },
      ],
    });
  });
});
