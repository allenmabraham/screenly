const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function isAllowedServerURL(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  const scheme = url.protocol.replace(/:$/, "").toLowerCase();
  const host = url.hostname.toLowerCase();
  if (!host) {
    return false;
  }
  return scheme === "https" || (scheme === "http" && LOOPBACK_HOSTS.has(host));
}

/**
 * Appends path components to a base URL the same way the macOS recorder's
 * `URL.appending(path:)` does, so servers hosted under a sub-path keep working.
 */
export function joinServerPath(baseURL: string, path: string) {
  const url = new URL(baseURL);
  const basePath = url.pathname.replace(/\/+$/, "");
  const suffix = path.replace(/^\/+/, "");
  url.pathname = `${basePath}/${suffix}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}
