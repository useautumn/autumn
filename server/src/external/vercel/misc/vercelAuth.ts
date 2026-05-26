import { AppEnv, type Organization } from "@autumn/shared";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { JWTExpired, JWTInvalid } from "jose/errors";
import { z } from "zod/v4";
import { logCaughtError } from "@/utils/logging/logCaughtError.js";

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

type VercelOidcTestOptions = {
	allowVercelTestOidc?: boolean;
};

const TEST_OIDC_PREFIX = "test_oidc:";

const synthesizeTestClaims = ({
	token,
	org,
	env,
	testOptions,
}: {
	token: string;
	org: Organization;
	env: AppEnv;
	testOptions?: VercelOidcTestOptions;
}): OidcClaims | null => {
	if (process.env.NODE_ENV === "production") return null;
	if (testOptions?.allowVercelTestOidc !== true) return null;
	if (!token.startsWith(TEST_OIDC_PREFIX)) return null;

	const installationId = token.slice(TEST_OIDC_PREFIX.length) || null;
	const audience =
		env === AppEnv.Live
			? (org.processor_configs?.vercel?.client_integration_id ??
				"test_client_id")
			: (org.processor_configs?.vercel?.sandbox_client_id ?? "test_client_id");
	const nowSeconds = Math.floor(Date.now() / 1000);

	return {
		sub: `test:${installationId ?? "no_install"}`,
		aud: audience,
		iss: "https://marketplace.vercel.com",
		exp: nowSeconds + 60 * 60,
		iat: nowSeconds,
		account_id: `acc_test_${installationId ?? "no_install"}`,
		installation_id: installationId,
	};
};

export async function verifyToken({
	token,
	org,
	env,
	testOptions,
}: {
	token: string;
	org: Organization;
	env: AppEnv;
	testOptions?: VercelOidcTestOptions;
}): Promise<OidcClaims> {
	const testClaims = synthesizeTestClaims({ token, org, env, testOptions });
	if (testClaims) return testClaims;

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
			// Dump both sides so an audience mismatch is debuggable end-to-end.
			// Common causes: org config has the wrong env's client_id, or the
			// integration was re-installed and the org's `sandbox_client_id`
			// hasn't been refreshed. Claim values are intentionally redacted —
			// `aud` is the only one relevant here; surface present keys for
			// schema-drift debugging without leaking user_email/etc.
			console.warn("[vercel/oidc] Invalid audience", {
				env,
				"token.aud (from Vercel)": claims.aud,
				"configured (from org.processor_configs.vercel)": clientIntegrationId,
				tokenClaimKeys: Object.keys(claims),
			});
			throw new AuthError("Invalid audience");
		}

		if (claims.iss !== "https://marketplace.vercel.com") {
			console.warn(
				"[vercel/oidc] Invalid issuer",
				"\n  token.iss:",
				claims.iss,
				"\n  expected: https://marketplace.vercel.com",
			);
			throw new AuthError("Invalid issuer");
		}

		return claims;
	} catch (err) {
		// Don't log here — the caller (vercelOidcAuthMiddleware) already runs
		// logCaughtError on the re-thrown error with the request-scoped logger.
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
	const { org, env, logger, testOptions } = c.get("ctx");
	const authHeader = c.req.header("authorization");
	const authType = c.req.header("x-vercel-auth");
	const path = c.req.path;
	const method = c.req.method;

	// Helper so every 401/403 here screams to console before the response is
	// returned. The 401/403 body's `code` is useful but doesn't show up in
	// dev server logs unless you tail responses, so we dump the reason here.
	const reject = (code: string, status: 401 | 403, reason?: string) => {
		console.warn({
			message: `[vercel/oidc] REJECT ${status} ${code}`,
			method,
			path,
			reason: reason ?? "(none)",
			authType: authType ?? "(absent)",
			authHeaderPresent: Boolean(authHeader),
		});
		const error = status === 401 ? "Unauthorized" : "Forbidden";
		return c.json({ error, code }, status);
	};

	// Validate required headers
	if (!authHeader) {
		return reject("missing_auth_header", 401);
	}

	if (!authType) {
		return reject("missing_auth_type_header", 401);
	}

	if (!["user", "system"].includes(authType)) {
		return reject("invalid_auth_type", 401, `got "${authType}"`);
	}

	// Extract and verify token
	let token: string;
	try {
		token = getAuthorizationToken(authHeader);
	} catch (error: any) {
		logCaughtError({
			logger,
			message: "[vercel/oidc] Invalid authorization header",
			error,
			data: { method, path },
			level: "warn",
		});
		return reject(
			"invalid_auth_header_format",
			401,
			error?.message ?? String(error),
		);
	}

	// Verify JWT using JWKS
	let claims: OidcClaims;
	try {
		claims = await verifyToken({ token, org, env, testOptions });
	} catch (error: any) {
		logCaughtError({
			logger,
			message: "[vercel/oidc] verifyToken threw",
			error,
			data: {
				method,
				path,
				env,
				configuredAud:
					env === AppEnv.Live
						? org?.processor_configs?.vercel?.client_integration_id
						: org?.processor_configs?.vercel?.sandbox_client_id,
			},
			level: "warn",
		});
		return c.json(
			{
				error: `Unauthorized: ${error.message}`,
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

	// For /v1/products/* routes, integrationConfigurationId is a product config ID, not installation ID
	// So we skip installation_id validation for these routes
	const isProductsRoute = path.includes("/v1/products/");

	if (!isProductsRoute) {
		// Only validate installation_id for /v1/installations/* routes
		if (authType === "user") {
			// User auth: always validate installation_id matches URL param
			if (claims.installation_id !== integrationConfigurationId) {
				return reject(
					"installation_id_mismatch",
					403,
					`user-auth claims.installation_id=${claims.installation_id} vs url=${integrationConfigurationId}`,
				);
			}
		} else if (authType === "system") {
			// System auth: validate installation_id only if not null
			if (claims.installation_id !== null) {
				if (claims.installation_id !== integrationConfigurationId) {
					return reject(
						"installation_id_mismatch",
						403,
						`system-auth claims.installation_id=${claims.installation_id} vs url=${integrationConfigurationId}`,
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
