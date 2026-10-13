import { createRemoteJWKSet, jwtVerify } from "jose";

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/**
 * Verifies a Privy access token (ES256 JWT) against the app's published
 * JWKS. jose caches the keys and refetches on rotation. Returns the user's Privy DID.
 */
export async function verifyAccessToken(
  token: string,
  config: { appId: string },
): Promise<{ userId: string; sessionId?: string }> {
  let jwks = keySets.get(config.appId);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${config.appId}/jwks.json`));
    keySets.set(config.appId, jwks);
  }
  const { payload } = await jwtVerify(token, jwks, {
    issuer: "privy.io",
    audience: config.appId,
    algorithms: ["ES256"],
  });
  if (!payload.sub) throw new Error("Privy access token has no subject.");
  return { userId: payload.sub, sessionId: typeof payload.sid === "string" ? payload.sid : undefined };
}
