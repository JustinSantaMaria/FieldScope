export function createShareFetch(linkId: string) {
  return async function shareFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const headers = new Headers(options.headers);
    headers.set("X-Share-Mode", "true");
    headers.set("X-Share-Link-Id", linkId);
    
    return fetch(url, {
      ...options,
      headers,
    });
  };
}

export function getShareHeaders(linkId: string): Record<string, string> {
  return {
    "X-Share-Mode": "true",
    "X-Share-Link-Id": linkId,
  };
}
