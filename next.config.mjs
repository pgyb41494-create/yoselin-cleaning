/** @type {import('next').NextConfig} */
const firebaseAuthHost = 'yoselinscleaning-cdee8.firebaseapp.com';

const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            // Required for Google signInWithPopup to communicate with the opener.
            value: 'same-origin-allow-popups',
          },
        ],
      },
    ];
  },
  async rewrites() {
    // Proxy Firebase Auth helpers onto this domain so redirect sign-in
    // works on browsers that block third-party storage (iOS Safari, Chrome).
    return {
      beforeFiles: [
        {
          source: '/__/auth/:path*',
          destination: `https://${firebaseAuthHost}/__/auth/:path*`,
        },
        {
          source: '/__/firebase/:path*',
          destination: `https://${firebaseAuthHost}/__/firebase/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
