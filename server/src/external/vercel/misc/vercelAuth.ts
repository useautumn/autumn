import { AppEnv, type Organization } from "@autumn/shared";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { JWTExpired, JWTInvalid } from "jose/errors";
import { z } from "zod/v4";
import { logCaughtError } from "@/utils/logging/logCaughtError.js";

const JWKS = createRemoteJWKSet(
	new URL(`https://marketplace.vercel.com/.well-known/jwks`),
);

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

		const clientIntegrationId =
			env === AppEnv.Live
				? org.processor_configs?.vercel?.client_integration_id
				: org.processor_configs?.vercel?.sandbox_client_id;

		if (claims.aud !== clientIntegrationId) {
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

export const vercelOidcAuthMiddleware = async (c: any, next: any) => {
	const { org, env, logger, testOptions } = c.get("ctx");
	const authHeader = c.req.header("authorization");
	const authType = c.req.header("x-vercel-auth");
	const path = c.req.path;
	const method = c.req.method;

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

	if (!authHeader) {
		return reject("missing_auth_header", 401);
	}

	if (!authType) {
		return reject("missing_auth_type_header", 401);
	}

	if (!["user", "system"].includes(authType)) {
		return reject("invalid_auth_type", 401, `got "${authType}"`);
	}

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

	const integrationConfigurationId = c.req.param("integrationConfigurationId");

	const isProductsRoute = path.includes("/v1/products/");

	if (!isProductsRoute) {
		if (authType === "user") {
			if (claims.installation_id !== integrationConfigurationId) {
				return reject(
					"installation_id_mismatch",
					403,
					`user-auth claims.installation_id=${claims.installation_id} vs url=${integrationConfigurationId}`,
				);
			}
		} else if (authType === "system") {
			if (claims.installation_id !== null) {
				if (claims.installation_id !== integrationConfigurationId) {
					return reject(
						"installation_id_mismatch",
						403,
						`system-auth claims.installation_id=${claims.installation_id} vs url=${integrationConfigurationId}`,
					);
				}
			}
		}
	}
	c.set("vercelClaims", claims);

	await next();
};
