import { AppEnv, type Organization } from "@autumn/shared";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { JWTExpired, JWTInvalid } from "jose/errors";
import { z } from "zod/v4";

const JWKS = createRemoteJWKSet(
	new URL(`https://marketplace.vercel.com/.well-known/jwks`),
);

/** Vercel OIDC Claims schema */
export const OidcClaimsSchema = z.object({
	sub: z.string(),
	aud: z.string(),
	iss: z.string(),
	exp: z.number(),
	iat: z.number(),
	account_id: z.string(),
	installation_id: z.string().nullable(),
	user_id: z.string().optional(),
	user_role: z.string().optional(),
	user_name: z.string().optional(),
	user_avatar_url: z.string().optional(),
});

export type OidcClaims = z.infer<typeof OidcClaimsSchema>;

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
		const { payload: claims } = await jwtVerify<OidcClaims>(token, JWKS, {
			clockTolerance: 5,
		});

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

/**
 * OIDC authentication middleware for Vercel integration routes
 * Validates both user and system authentication via OIDC tokens
 *
 * Flow:
 * 1. Extract Authorization Bearer token and X-Vercel-Auth header (user|system)
 * 2. Verify JWT using JWKS
 * 3. For user auth: validate installation_id matches URL param
 * 4. For system auth: validate installation_id if not null
 * 5. Store validated claims in context
 */
export const vercelOidcAuthMiddleware = async (c: any, next: any) => {
	const { org, env } = c.get("ctx");
	const authHeader = c.req.header("authorization");
	const authType = c.req.header("x-vercel-auth");

	// Validate required headers
	if (!authHeader) {
		return c.json({ error: "Unauthorized", code: "missing_auth_header" }, 401);
	}

	if (!authType) {
		return c.json(
			{ error: "Unauthorized", code: "missing_auth_type_header" },
			401,
		);
	}

	if (!["user", "system"].includes(authType)) {
		return c.json({ error: "Unauthorized", code: "invalid_auth_type" }, 401);
	}

	// Extract and verify token
	let token: string;
	try {
		token = getAuthorizationToken(authHeader);
	} catch (error) {
		return c.json(
			{ error: "Unauthorized", code: "invalid_auth_header_format" },
			401,
		);
	}

	// Verify JWT using JWKS
	let claims: OidcClaims;
	try {
		claims = await verifyToken({ token, org, env });
	} catch (error: any) {
		return c.json(
			{
				error: "Unauthorized" + error.message,
				code:
					error instanceof AuthError
						? "auth_failed"
						: "jwt_verification_failed",
			},
			401,
		);
	}

	// Validate installation_id based on auth type and route
	const integrationConfigurationId = c.req.param("integrationConfigurationId");
	const path = c.req.path;

	// For /v1/products/* routes, integrationConfigurationId is a product config ID, not installation ID
	// So we skip installation_id validation for these routes
	const isProductsRoute = path.includes("/v1/products/");

	if (!isProductsRoute) {
		// Only validate installation_id for /v1/installations/* routes
		if (authType === "user") {
			// User auth: always validate installation_id matches URL param
			if (claims.installation_id !== integrationConfigurationId) {
				return c.json(
					{ error: "Forbidden", code: "installation_id_mismatch" },
					403,
				);
			}
		} else if (authType === "system") {
			// System auth: validate installation_id only if not null
			if (claims.installation_id !== null) {
				if (claims.installation_id !== integrationConfigurationId) {
					return c.json(
						{ error: "Forbidden", code: "installation_id_mismatch" },
						403,
					);
				}
			}
			// If installation_id is null, we only validate JWKS (already done above)
		}
	}
	// Store claims in context for downstream handlers
	c.set("vercelClaims", claims);

	await next();
};
