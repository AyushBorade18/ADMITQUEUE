import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

const config = [
  ...coreWebVitals,
  ...typescript,
  { ignores: ['.next/**', 'node_modules/**', 'engine/**', 'public/sw.js', 'next-env.d.ts', 'coverage/**'] },
  {
    rules: {
      // the emulator and scripts intentionally use loose types
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];

export default config;
