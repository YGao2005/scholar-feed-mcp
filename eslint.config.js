// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["build/**", "node_modules/**"] },
  js.configs.recommended,
  {
    files: ["src/**/*.ts"],
    extends: [...tseslint.configs.recommended],
    rules: {
      // stdout is the JSON-RPC stdio channel — only console.error is allowed
      // on the server path, mirroring the stdio-hygiene test.
      "no-console": ["error", { allow: ["error"] }],
    },
  },
  {
    // index.ts handles `--version` in CLI mode and exits before the stdio
    // transport starts, so console.log to stdout is intentional there.
    files: ["src/index.ts"],
    rules: { "no-console": ["error", { allow: ["error", "log"] }] },
  },
  // Disables ESLint formatting rules that would conflict with Prettier. Keep last.
  prettier,
);
