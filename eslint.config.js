import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default [
 {ignores:['node_modules/**','dist/**','work/**','artifacts/**','playwright-report/**','test-results/**']},
 {files:['**/*.js','**/*.mjs'],...js.configs.recommended,languageOptions:{ecmaVersion:'latest',sourceType:'module',globals:{...globals.node,...globals.browser}},rules:{...js.configs.recommended.rules,'no-unused-vars':['error',{argsIgnorePattern:'^_|^next$',varsIgnorePattern:'^_',caughtErrors:'none'}]}},
 ...tseslint.configs.recommended.map(config=>({...config,files:['src/**/*.ts','src/**/*.tsx']})),
 {files:['src/**/*.ts','src/**/*.tsx'],languageOptions:{globals:globals.browser},rules:{'@typescript-eslint/no-explicit-any':'off','@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',varsIgnorePattern:'^_',caughtErrors:'none'}]}},
];
