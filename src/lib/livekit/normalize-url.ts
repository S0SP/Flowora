/** LiveKit server SDKs expect https:// host, not wss:// */
export function normalizeLiveKitHttpUrl(url: string): string {
  if (!url) return url;
  return url.replace("wss://", "https://").replace("ws://", "http://");
}

export function normalizeLiveKitWsUrl(url: string): string {
  if (!url) return url;
  return url.replace("https://", "wss://").replace("http://", "ws://");
}
