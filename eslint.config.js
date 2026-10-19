import globals from 'globals';

export default [
  { files: ['main.js'], languageOptions: { sourceType: 'script', globals: { ...globals.browser } } },
  { files: ['scripts/**/*.mjs'], languageOptions: { sourceType: 'module', globals: { ...globals.node, ...globals.browser } } },
  { rules: { 'no-undef': 'error', 'no-unused-vars': ['error', { args: 'none' }], 'no-redeclare': 'error' } },
];
