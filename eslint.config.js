import eslintPluginFunctional from 'eslint-plugin-functional';
import typescriptEslint from 'typescript-eslint';
import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default typescriptEslint.config(
  eslint.configs.recommended,
  ...typescriptEslint.configs.recommended,
  eslintConfigPrettier,
  {
    plugins: {
      functional: eslintPluginFunctional,
    },
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      // Functional Programming Rules
      'functional/no-let': 'warn', // Prefer const
      'functional/no-loop-statements': 'warn', // Prefer map/reduce/filter
      'functional/no-this-expressions': 'warn', // Avoid classes/this
      'functional/immutable-data': 'warn', // Prefer immutability
      'functional/prefer-readonly-type': 'off', // Too strict for now

      // Code Quality
      'complexity': ['warn', { max: 10 }], // Keep functions simple
      'max-lines': ['warn', { max: 200, skipBlankLines: true, skipComments: true }], // Short files
      'max-lines-per-function': ['warn', { max: 50, skipBlankLines: true, skipComments: true }], // Short methods

      // TypeScript specific
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', '*.config.js', '.system/'],
  }
);
