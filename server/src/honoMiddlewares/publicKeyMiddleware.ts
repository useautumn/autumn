import { AppEnv, AuthType, ErrCode } from "@autumn/shared";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { verifyPublicKey } from "@/internal/dev/api-keys/publicKeyUtils.js";
import RecaseError from "@/utils/errorUtils.js";

const allowedEndpoints = [
	{
		method: "GET",
		path: "/v1/products",
	},
	{
		method: "POST",
		path: "/v1/entitled",
	},
	{
		method: "POST",
		path: "/v1/check",
	},
	{
		method: "POST",
		path: "/v1/attach",
	},
	{
		method: "GET",
		path: "/v1/customers/:customerId",
	},
];

interface IsAllowedEndpointProps {
	path: string;
	method: string;
}

const isAllowedEndpoint = ({ path, method }: IsAllowedEndpointProps) => {
	// Convert pattern to regex, handling path params like :id
	const matchPath = (pattern: string, path: string) => {
		// Convert pattern to regex, handling path params like :id
		const regexPattern = pattern.replace(/:[^/]+/g, "[^/]+");
		const regex = new RegExp(`^${regexPattern}$`);
		// Remove query params before testing
		const pathWithoutQuery = path.split("?")[0];
		return regex.test(pathWithoutQuery);
	};

	for (const endpoint of allowedEndpoints) {
		if (endpoint.method === method && matchPath(endpoint.path, path)) {
			return true;
		}
	}
	return false;
};

/**
 * Middleware to verify publishable key and populate auth context
 * Only allows access to specific public endpoints
 *
 * Steps:
 * 1. Check if endpoint is allowed for publishable keys
 * 2. Validate publishable key format (am_pk_test or am_pk_live)
 * 3. Determine environment from key prefix
 * 4. Verify the publishable key
 * 5. Store org, features, env, authType, isPublic in context
 */
export const publicKeyMiddleware = async (
	c: Context<HonoEnv>,
	pkey: string,
	next: Next,
) => {
	const ctx = c.get("ctx");

	// Step 1: Check if endpoint is allowed
	if (
		!isAllowedEndpoint({
			path: c.req.path,
			method: c.req.method,
		})
	) {
		throw new RecaseError({
			message: `Endpoint ${c.req.path} not accessible via publishable key. Please try with a secret key instead.`,
			code: ErrCode.EndpointNotPublic,
			statusCode: 401,
		});
	}

	// Step 2: Validate publishable key format
	if (!pkey.startsWith("am_pk_test") && !pkey.startsWith("am_pk_live")) {
		throw new RecaseError({
			message: "Invalid publishable key",
			code: ErrCode.InvalidPublishableKey,
			statusCode: 401,
		});
	}

	// Step 3: Determine environment from key prefix
	const env: AppEnv = pkey.startsWith("am_pk_test")
		? AppEnv.Sandbox
		: AppEnv.Live;

	// Step 4: Verify the publishable key
	const data = await verifyPublicKey({
		db: ctx.db,
		pkey,
		env,
	});

	if (!data) {
		throw new RecaseError({
			message: "Invalid publishable key",
			code: ErrCode.InvalidPublishableKey,
			statusCode: 401,
		});
	}

	// Step 5: Store auth data in context
	const { org, features } = data;

	ctx.org = org;
	ctx.features = features;
	ctx.env = env;
	ctx.authType = AuthType.PublicKey;
	ctx.isPublic = true;

	await next();
};
