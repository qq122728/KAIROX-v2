/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.100.65"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb"
    }
  },
  // Prevent heic2any from being bundled into SSR chunks
  serverExternalPackages: ["heic2any"],
};

export default nextConfig;
