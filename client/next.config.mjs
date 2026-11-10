import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientDir = path.dirname(fileURLToPath(import.meta.url));
// shared/ sits next to client/ at the repo root and is imported as @shared/*,
// so the build root (and the standalone file trace) must be the repo root.
const repoRoot = path.resolve(clientDir, '..');

// Only for `next dev` on its own: forward /api/* to a backend, the way the Vite
// dev server's proxy does. Leave it unset in a deployed image. There, /api/* is
// routed to the backend by the front door (ALB or nginx) before it reaches Next,
// and rewrite destinations are frozen at build time, which a runtime-configured
// image should not depend on.
const apiProxyTarget = process.env.API_PROXY_TARGET;

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: repoRoot,
  poweredByHeader: false,
  turbopack: {
    root: repoRoot,
    rules: {
      // `import Icon from './icon.svg?react'` is a React component, same as vite-plugin-svgr.
      // A plain `import url from './icon.svg'` keeps Next's default asset handling.
      '*.svg': {
        condition: { query: /[?&]react(?=&|$)/ },
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },
  async rewrites() {
    if (!apiProxyTarget) return [];
    return [{ source: '/api/:path*', destination: `${apiProxyTarget}/api/:path*` }];
  },
};

export default nextConfig;
