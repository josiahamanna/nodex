export function envString(name: string, fallback = ""): string {
  const v = process.env[name];
  return typeof v === "string" ? v.trim() : fallback;
}

export function requireJwtSecret(): string {
  const s = envString("JWT_SECRET");
  const nodeEnv = envString("NODE_ENV", "development");
  if (s.length < 32 && nodeEnv === "production") {
    throw new Error("JWT_SECRET must be at least 32 characters in production");
  }
  if (s.length === 0) {
    if (nodeEnv === "production") {
      throw new Error("JWT_SECRET is required in production");
    }
    return "dev-only-nodex-sync-secret-min-32-chars!!";
  }
  return s;
}
