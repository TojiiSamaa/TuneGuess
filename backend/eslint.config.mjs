import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  { files: ['**/*.mjs'], languageOptions: { globals: globals.node } },
  {
    rules: {
      // Le code type volontairement les réponses d'API tierces en `any`.
      '@typescript-eslint/no-explicit-any': 'off',
      // Paramètres imposés par une interface et `catch (err)` ignorés : pas des oublis.
      '@typescript-eslint/no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
    },
  },
);
