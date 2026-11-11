export function getIsolatedMongoTestUri(uri?: string): string | undefined {
  if (!uri) {
    return undefined;
  }
  try {
    const parsed = new URL(uri);
    const databaseName = decodeURIComponent(parsed.pathname.slice(1));
    const isLocal = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
    return isLocal && /(^|[-_])(test|testing|ci)([-_]|$)/i.test(databaseName)
      ? uri
      : undefined;
  } catch {
    return undefined;
  }
}

export function getLocalRedisTestUrl(uri?: string): string | undefined {
  if (!uri) {
    return undefined;
  }
  try {
    const parsed = new URL(uri);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)
      ? uri
      : undefined;
  } catch {
    return undefined;
  }
}
