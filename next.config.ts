import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["webtorrent"],
  experimental: {},
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // webtorrent must only run on the server
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        fs: false,
        dns: false,
        dgram: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        http: false,
        https: false,
        zlib: false,
      };
    }
    return config;
  },
};

export default nextConfig;
