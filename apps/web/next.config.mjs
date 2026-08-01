/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Proxies the API through this same origin so the session cookie is a plain
  // first-party cookie from the browser's point of view. Needed because the
  // web app and API are deployed on entirely different domains (e.g. Vercel +
  // Render): SameSite=None cookies are the documented fix for cross-site
  // fetch(), but Safari's cross-site tracking prevention can still refuse to
  // store a cookie for a domain the browser has no other relationship with,
  // regardless of SameSite/Secure being set correctly (confirmed on this
  // deploy: Storage > Cookies never even listed the API's domain). Routing
  // browser requests through /api/backend/* on this origin — proxied
  // server-side to the real API, which is not subject to CORS or cookie
  // rules at all — sidesteps the problem entirely instead of fighting it.
  async rewrites() {
    if (!process.env.API_PROXY_TARGET) return [];
    return [{ source: '/api/backend/:path*', destination: `${process.env.API_PROXY_TARGET}/:path*` }];
  },
};

export default nextConfig;
