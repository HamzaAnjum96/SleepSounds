import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// Focused lint: accessibility (jsx-a11y), React hook correctness, and basic
// JS/TS soundness. Not a style police — type style is left to tsc/strict.
export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'tests', 'scripts', 'public', '*.config.*'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'jsx-a11y': jsxA11y, 'react-hooks': reactHooks },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // The classic, high-value hook rules. react-hooks v6's newer opinions
      // (e.g. set-state-in-effect) flag legitimate prop-sync effects, so we
      // stick to correctness: hook ordering (error) and deps (warn).
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // The synthesis code is intentionally untyped at the edges; tsc/strict
      // already guards real type safety, so don't double-flag `any`/casts.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
