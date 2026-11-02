/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  devIndicators: false,
  serverExternalPackages: ['@electric-sql/pglite', 'pg', 'bcryptjs'],
  outputFileTracingExcludes: {
    '*': [
      './.db_pglite/**/*',
      './.db_pglite/**',
      '.db_pglite/**/*',
      '.db_pglite/**',
      '**/.db_pglite/**',
      '**/.db_pglite/**/*',
      '.db_pglite',
      './.db_pglite',
      './.db_pglite_test/**/*',
      './.db_pglite_test/**',
      '.db_pglite_test/**/*',
      '.db_pglite_test/**',
      '**/.db_pglite_test/**',
      '**/.db_pglite_test/**/*',
      '.db_pglite_test',
      './.db_pglite_test',
    ],
    '/*': [
      './.db_pglite/**/*',
      './.db_pglite/**',
      '.db_pglite/**/*',
      '.db_pglite/**',
      '**/.db_pglite/**',
      '**/.db_pglite/**/*',
      '.db_pglite',
      './.db_pglite',
      './.db_pglite_test/**/*',
      './.db_pglite_test/**',
      '.db_pglite_test/**/*',
      '.db_pglite_test/**',
      '**/.db_pglite_test/**',
      '**/.db_pglite_test/**/*',
      '.db_pglite_test',
      './.db_pglite_test',
    ],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
