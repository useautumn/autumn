import { AppEnv, type Organization } from "@autumn/shared";
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
	env,
}: {
	token: string;
	org: Organization;
	env: AppEnv;
}): Promise<OidcClaims> {
	try {
		const { payload: claims } = await jwtVerify<OidcClaims>(token, JWKS);

		// Get the correct client_integration_id based on env
		const clientIntegrationId =
			env === AppEnv.Live
				? org.processor_configs?.vercel?.client_integration_id
				: org.processor_configs?.vercel?.sandbox_client_id;

		if (claims.aud !== clientIntegrationId) {
			throw new AuthError("Invalid audience");
		}

		if (claims.iss !== "https://marketplace.vercel.com") {
			throw new AuthError("Invalid issuer");
		}

		console.log("Vercel auth claims", JSON.stringify(claims, null, 4));
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

export function getAuthorizationToken(authHeader: string): string {
	if (!authHeader.startsWith("Bearer ")) {
		throw new AuthError("Invalid Authorization header");
	}

	return authHeader.split(" ")[1];
}

export const verifyClaims = ({
	claims,
	org,
	env,
	metadata,
}: {
	claims: OidcClaims;
	org: Organization;
	env: AppEnv;
	metadata: {
		integrationConfigurationId: string;
	};
}) => {
	// Get the correct client_integration_id based on env
	const clientIntegrationId =
		env === AppEnv.Live
			? org.processor_configs?.vercel?.client_integration_id
			: org.processor_configs?.vercel?.sandbox_client_id;

	if (claims.aud !== clientIntegrationId) {
		throw new AuthError("Invalid audience");
	}

	if (claims.installation_id !== metadata.integrationConfigurationId) {
		throw new Error("Invalid installation ID");
	}

	if (claims.iss !== "https://marketplace.vercel.com") {
		throw new AuthError("Invalid issuer");
	}

	return claims;
};

export class AuthError extends Error {}
