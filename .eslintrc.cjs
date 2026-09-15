module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { sourceType: 'module', ecmaVersion: 2022 },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: { node: true, es2022: true, browser: true },
  ignorePatterns: ['dist/**', 'node_modules/**', 'release/**'],
  rules: {
    'max-lines': ['warn', 300],
    'max-lines-per-function': ['warn', 60],
    '@typescript-eslint/no-explicit-any': 'warn',
  },
};
