/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['node:sqlite', 'pdf-parse', 'mammoth', 'jszip', 'pdf-lib'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), 'node:sqlite', 'pdf-parse', 'mammoth', 'jszip', 'pdf-lib'];
    }
    return config;
  },
};

export default nextConfig;
