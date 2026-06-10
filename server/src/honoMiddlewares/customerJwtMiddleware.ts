import { AppEnv, AuthType, ErrCode, sortFeatures } from "@autumn/shared";
import type { Context, Next } from "hono";
import { forceJsonBodyField } from "@/honoUtils/forceJsonBody.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { getCustomerJwtOrg } from "@/internal/auth/cacheCustomerJwtOrg.js";
import {
	AUD_REFRESH,
	CustomerJwtConfigError,
	verifyCustomerJwt,
} from "@/internal/auth/customerJwt.js";
import { readEpoch } from "@/internal/auth/customerJwtEpoch.js";
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
		// A missing/weak secret is OUR misconfig — surface it as 500, not a 401
		// that masquerades as every customer holding a bad token.
		if (error instanceof CustomerJwtConfigError) {
			throw error;
		}
		throw new RecaseError({
			message: "Invalid or expired customer token",
			code: ErrCode.InvalidRequest,
			statusCode: 401,
		});
	}

	// Revocation: token is dead if its epoch is below the family floor.
	// Redis down ⇒ floor 0 ⇒ nothing rejected (fail-open).
	const floor = await readEpoch({
		orgId: claims.orgId,
		customerId: claims.customerId,
	});
	if (claims.epoch < floor) {
		throw new RecaseError({
			message: "Customer token revoked",
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

	const env = claims.env === AppEnv.Live ? AppEnv.Live : AppEnv.Sandbox;
	const data = await getCustomerJwtOrg({
		db: ctx.db,
		orgId: claims.orgId,
		env,
	});
	if (!data) {
		// 401 (not 404): the token names an org we can't resolve — treat as an
		// auth failure rather than leaking org existence.
		throw new RecaseError({
			message: "Organization not found",
			code: ErrCode.OrgNotFound,
			statusCode: 401,
		});
	}
	const { org, features } = data;
	sortFeatures({ features });

	ctx.org = org;
	ctx.features = features;
	ctx.env = env;
	ctx.authType = AuthType.CustomerJwt;
	ctx.scopes = claims.scopes; // non-empty ⇒ scopeCheckMiddleware enforces
	ctx.isCustomerJwt = true; // read by customerJwtVersionMiddleware (v2.3+ gate)
	ctx.customerJwt = {
		customerId: claims.customerId,
		epoch: claims.epoch,
		refreshKid: claims.refreshKid,
	};

	// Access tokens: force-set customer_id so every downstream load is scoped.
	// Force-set (not conditional) because getEntity's customer_id is optional.
	if (claims.aud !== AUD_REFRESH) {
		await forceJsonBodyField(c, "customer_id", claims.customerId);
	}

	await next();
};
