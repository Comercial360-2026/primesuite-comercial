// ESLint 9 (flat config). Antes `npm run lint` no corría: había `eslint@9`
// pero ningún `eslint.config.*`, así que la CLI solo imprimía la guía de
// migración. Esto es la config mínima que necesita el proyecto.
//
// `typecheck` (tsc) sigue siendo la puerta dura; aquí casi todo es `warn`
// para que el lint informe sin bloquear. Las reglas que SÍ pillan bugs
// reales (react-hooks) se quedan como error.

import js from '@eslint/js';
import globals from 'globals';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    ignores: [
      'dist/',
      'dev-dist/',
      'node_modules/',
      'graphify-out/',
      // Edge Functions: son Deno (imports por URL, global `Deno`); tienen
      // su propia comprobación con `deno check`.
      'supabase/functions/**',
      '*.config.{js,ts,mjs,cjs}',
    ],
  },
  js.configs.recommended,
  {
    // Scripts de mantenimiento que se ejecutan con Node, no en el navegador
    // (p. ej. scripts/ayuda-cobertura.mjs): globals de Node.
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021 },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // En TS manda `tsc`: `no-undef` da falsos positivos (p. ej. el global
      // `React` de @types/react) — es la recomendación de typescript-eslint.
      'no-undef': 'off',
      // TS ya marca variables sin usar; aquí como aviso y con escape `_`.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'prefer-const': 'warn',
    },
  },
];
