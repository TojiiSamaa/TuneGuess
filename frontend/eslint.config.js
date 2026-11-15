import js from '@eslint/js'
import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'

export default [
  { ignores: ['dist'] },
  js.configs.recommended,
  // essential = règles de justesse ; les règles de mise en forme (recommended) ne sont pas imposées.
  ...pluginVue.configs['flat/essential'],
  { languageOptions: { globals: globals.browser } },
  { files: ['*.config.js'], languageOptions: { globals: globals.node } },
  { rules: { 'no-unused-vars': ['error', { caughtErrors: 'none' }] } },
]
