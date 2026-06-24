/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker deployments
  // (only active when building for production)
  output: process.env.DOCKER_BUILD ? "standalone" : undefined,
};

export default nextConfig;
