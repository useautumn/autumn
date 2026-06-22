import {
	AppEnv,
	AuthType,
	ErrCode,
	Scopes,
	sortFeatures,
} from "@autumn/shared";
import type { Context, Next } from "hono";
import { forceJsonBodyField } from "@/honoUtils/forceJsonBody.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { getCustomerJwtAuth } from "@/internal/auth/cacheCustomerJwtAuth.js";
import {
	AUD_REFRESH,
	CustomerJwtConfigError,
	verifyCustomerJwt,
} from "@/internal/auth/customerJwt.js";
import RecaseError from "@/utils/errorUtils.js";

/**
 * Default-deny allowlists keyed by token audience. Access tokens reach the 6
 * data routes; refresh tokens reach ONLY keys.refresh. Anything else is 403 by
 * virtue of not being listed — bidirectional aud isolation.
 */
const ACCESS_ROUTES = new Set([
	"POST /v1/check",
	"POST /v1/track",
	"POST /v1/balances.check",
	"POST /v1/balances.track",
	"POST /v1/customers.get",
	"POST /v1/entities.get",
]);
const REFRESH_ROUTES = new Set(["POST /v1/keys.refresh"]);

// Scopes are a server-side constant (not minted into the token); scopeCheckMiddleware
// enforces them per-route. Hardcoded here so an empty ctx.scopes can't fail open.
const TOKEN_SCOPES: string[] = [
	Scopes.Customers.Read,
	Scopes.Balances.Read,
	Scopes.Balances.Write,
];

export const customerJwtMiddleware = async (
	c: Context<HonoEnv>,
	token: string,
	next: Next,
) => {
	const ctx = c.get("ctx");

	let claims: Awaited<ReturnType<typeof verifyCustomerJwt>>;
	try {
		claims = await verifyCustomerJwt({ token });
	} catch (error) {
		// Missing/weak secret is OUR misconfig — surface as 500, not a fake 401.
		if (error instanceof CustomerJwtConfigError) {
			throw error;
		}
		throw new RecaseError({
			message: "Invalid or expired customer token",
			code: ErrCode.InvalidRequest,
			statusCode: 401,
		});
	}

	const routeKey = `${c.req.method} ${c.req.path.split("?")[0]}`;
	const allowed = claims.aud === AUD_REFRESH ? REFRESH_ROUTES : ACCESS_ROUTES;
	if (!allowed.has(routeKey)) {
		throw new RecaseError({
			message: `Endpoint ${routeKey} is not accessible with this customer token`,
			code: ErrCode.InvalidRequest,
			statusCode: 403,
		});
	}

	// One read: org + features + revocation epoch, keyed by the immutable
	// internal_customer_id. Cache miss → DB; DB down → throws → auth fails.
	const auth = await getCustomerJwtAuth({
		internalCustomerId: claims.internalCustomerId,
	});
	if (!auth) {
		// Family gone (customer deleted) or unresolvable org — treat as auth failure.
		throw new RecaseError({
			message: "Customer token is no longer valid",
			code: ErrCode.InvalidRequest,
			statusCode: 401,
		});
	}
	if (claims.epoch < auth.epoch) {
		throw new RecaseError({
			message: "Customer token revoked",
			code: ErrCode.InvalidRequest,
			statusCode: 401,
		});
	}

	const env = claims.env === AppEnv.Live ? AppEnv.Live : AppEnv.Sandbox;
	sortFeatures({ features: auth.features });

	ctx.org = auth.org;
	ctx.features = auth.features;
	ctx.env = env;
	ctx.authType = AuthType.CustomerJwt;
	ctx.scopes = TOKEN_SCOPES;
	ctx.isCustomerJwt = true; // read by customerJwtVersionMiddleware (v2.3+ gate)
	ctx.customerJwt = {
		customerId: claims.customerId,
		internalCustomerId: claims.internalCustomerId,
		epoch: claims.epoch,
		refreshKid: claims.refreshKid,
	};

	// Access tokens: force-set customer_id (the external `sub`) so every
	// downstream load is scoped. Refresh tokens carry no body to scope.
	if (claims.aud !== AUD_REFRESH) {
		await forceJsonBodyField(c, "customer_id", claims.customerId);
	}

	await next();
};
