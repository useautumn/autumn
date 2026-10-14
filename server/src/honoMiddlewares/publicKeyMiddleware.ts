import { AppEnv, AuthType, ErrCode } from "@autumn/shared";
import type { Context, Next } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { verifyPublicKey } from "@/internal/dev/apiKeys/publicKeyUtils.js";
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
		method: "GET",
		path: "/v1/customers/:customerId",
	},
];

interface IsAllowedEndpointProps {
	path: string;
	method: string;
}

const isAllowedEndpoint = ({ path, method }: IsAllowedEndpointProps) => {
	const matchPath = (pattern: string, path: string) => {
		const regexPattern = pattern.replace(/:[^/]+/g, "[^/]+");
		const regex = new RegExp(`^${regexPattern}$`);
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

export const publicKeyMiddleware = async (
	c: Context<HonoEnv>,
	pkey: string,
	next: Next,
) => {
	const ctx = c.get("ctx");

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

	if (!pkey.startsWith("am_pk_test") && !pkey.startsWith("am_pk_live")) {
		throw new RecaseError({
			message: "Invalid publishable key",
			code: ErrCode.InvalidPublishableKey,
			statusCode: 401,
		});
	}

	const env: AppEnv = pkey.startsWith("am_pk_test")
		? AppEnv.Sandbox
		: AppEnv.Live;

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

	const { org, features } = data;

	ctx.org = org;
	ctx.features = features;
	ctx.env = env;
	ctx.authType = AuthType.PublicKey;
	ctx.isPublic = true;
	ctx.scopes = [];

	await next();
};
