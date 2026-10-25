import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // Global ignores: must be a standalone object
  {
    ignores: [
      '.next/**',
      '.db_pglite/**',
      'node_modules/**',
      'prisma/**',
      'scripts/**',
      'tests/**',
      'public/**',
      '*.config.js',
      '*.config.mjs',
      'next-env.d.ts'
    ],
  },
  ...compat.extends('next/core-web-vitals'),
  {
    files: ['src/**/*.{ts,tsx,js,jsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@next/next/no-img-element': 'off',
      'react-hooks/exhaustive-deps': 'warn'
    }
  }
];

export default eslintConfig;
