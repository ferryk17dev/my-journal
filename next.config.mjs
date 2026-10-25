/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // The 5 MB image limit needs room for multipart form boundaries/headers.
      bodySizeLimit: "5.25mb",
    },
  },
};

export default nextConfig;
