import type { Organization } from "@autumn/shared";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { JWTExpired, JWTInvalid } from "jose/errors";

const JWKS = createRemoteJWKSet(
	new URL(`https://marketplace.vercel.com/.well-known/jwks`),
);

export interface OidcClaims {
	sub: string;
	aud: string;
	iss: string;
	exp: number;
	iat: number;
	account_id: string;
	installation_id: string;
	user_id: string;
	user_role: string;
	user_name?: string;
	user_avatar_url?: string;
}

export async function verifyToken({
	token,
	org,
}: {
	token: string;
	org: Organization;
}): Promise<OidcClaims> {
	try {
		const { payload: claims } = await jwtVerify<OidcClaims>(token, JWKS);

		if (claims.aud !== org.processor_configs?.vercel?.client_integration_id) {
			throw new AuthError("Invalid audience");
		}

		if (claims.iss !== "https://marketplace.vercel.com") {
			throw new AuthError("Invalid issuer");
		}

		return claims;
	} catch (err) {
		if (err instanceof JWTExpired) {
			throw new AuthError("Auth expired");
		}

		if (err instanceof JWTInvalid) {
			throw new AuthError("Auth invalid");
		}

		throw err;
	}
}

export function getAuthorizationToken(req: Headers): string {
	const authHeader = req.get("Authorization");
	const match = authHeader?.match(/^bearer (.+)$/i);

	if (!match) {
		throw new AuthError("Invalid Authorization header");
	}

	return match[1];
}

class AuthError extends Error {}
