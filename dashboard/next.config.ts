import path from 'node:path';
import type { NextConfig } from 'next';

// The dashboard imports shared code from the rest of the repository: brand tokens (../src/tokens.ts), the
// Edge Function request types (../supabase/functions/_shared) and the counter card (lib/counterCard.ts is also
// used by scripts/admin.ts). The repository root is therefore the build root.
const root = path.join(import.meta.dirname, '..');

const config: NextConfig = {
  reactStrictMode: true,
  turbopack: { root },
  outputFileTracingRoot: root,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default config;
