import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

/**
 * Brand rules, ported from the HexaData website. Style with @hexadata/brand roles and scales only.
 * Raw hex/rgb colours and Tailwind default palettes are forbidden in shipped code.
 */
const PALETTE =
  'gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const UTILITY = 'bg|text|border|fill|stroke|ring|outline|from|to|via|divide|shadow';

const brandRules = [
  'error',
  {
    selector: 'Literal[value=/#[0-9a-fA-F]{3,8}\\b|\\[#|\\[rgb|rgba?\\(|hsla?\\(/]',
    message: 'Brand rule: no hard-coded colours. Use --hd-* tokens or the hd-* Tailwind roles.',
  },
  {
    selector: `Literal[value=/\\b(${UTILITY})-(white\\b|black\\b|(${PALETTE})-[0-9])/]`,
    message:
      'Brand rule: use hexadata-brand roles (bg-hd-bg, text-hd-fg, ...), never Tailwind palette colours.',
  },
  {
    selector: `TemplateElement[value.raw=/\\b(${UTILITY})-(white\\b|black\\b|(${PALETTE})-[0-9])/]`,
    message: 'Brand rule: use hexadata-brand roles, never Tailwind palette colours.',
  },
];

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '.cache/**',
      'playwright-report/**',
      'test-results/**',
      'vendor/**',
      'apps/web/dev-dist/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.tsx', '**/*.jsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}', 'packages/templates/**/*.{ts,tsx}'],
    ...jsxA11y.flatConfigs.recommended,
  },
  {
    files: [
      'apps/web/src/**/*.{ts,tsx}',
      'packages/templates/src/**/*.{ts,tsx}',
      'packages/core/src/**/*.ts',
    ],
    rules: { 'no-restricted-syntax': brandRules },
  },
  {
    files: [
      '**/test/**',
      '**/*.test.{ts,tsx}',
      'e2e/**',
      '**/scripts/**',
      '*.config.{js,ts,mjs}',
      '**/*.config.{js,ts,mjs}',
    ],
    rules: { 'no-restricted-syntax': 'off', 'no-console': 'off' },
  },
  {
    // CommonJS config files (Puppeteer reads `.puppeteerrc.cjs`).
    files: ['**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
