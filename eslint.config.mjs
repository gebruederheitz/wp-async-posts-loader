import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default defineConfig([
    js.configs.recommended,
    eslintPluginPrettierRecommended,
    {
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'module',
            globals: {
                ...globals.browser,
            },
        },
        rules: {
            'prettier/prettier': 'error',
        },
    },
]);
