export const mintKeyJsDoc = `Mints a per-customer token (a scoped \`am_jwt_\` credential) so a downstream / self-hosted app can call Autumn directly without your secret key. Returns a short-lived access token plus a rotating refresh token, both bound to the given customer. Authenticated with your secret key.`;

export const refreshKeyJsDoc = `Exchanges a refresh token (sent as the Bearer credential) for a freshly rotated access + refresh pair. Self-service for the token holder — no secret key required. The previous refresh token is honored for one rotation as a grace window; replaying an older one revokes the customer's tokens.`;

export const revokeKeyJsDoc = `Revokes every outstanding token (access and refresh) for a customer. Authenticated with your secret key. New tokens can be issued afterwards with \`keys.mint\`.`;
