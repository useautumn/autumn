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
import {
	AUD_REFRESH,
	CustomerJwtConfigError,
	verifyCustomerJwt,
} from "@/internal/auth/customerJwt.js";
import { getCustomerJwtAuth } from "@/internal/auth/getCustomerJwtAuth.js";
import RecaseError from "@/utils/errorUtils.js";

const ACCESS_ROUTES = new Set([
	"POST /v1/check",
	"POST /v1/track",
	"POST /v1/balances.check",
	"POST /v1/balances.track",
	"POST /v1/customers.get",
	"POST /v1/entities.get",
	"POST /v1/events.list",
	"POST /v1/events.aggregate",
]);
const REFRESH_ROUTES = new Set(["POST /v1/keys.refresh"]);

const TOKEN_SCOPES: string[] = [
	Scopes.Customers.Read,
	Scopes.Balances.Read,
	Scopes.Balances.Write,
	Scopes.Analytics.Read,
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

	const auth = await getCustomerJwtAuth({
		internalCustomerId: claims.internalCustomerId,
		requestId: ctx.id,
	});
	if (!auth) {
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
	ctx.customerId = claims.customerId;
	ctx.authType = AuthType.CustomerJwt;
	ctx.scopes = TOKEN_SCOPES;
	ctx.isCustomerJwt = true;
	ctx.customerJwt = {
		customerId: claims.customerId,
		internalCustomerId: claims.internalCustomerId,
		epoch: claims.epoch,
		refreshKid: claims.refreshKid,
	};

	if (claims.aud !== AUD_REFRESH) {
		await forceJsonBodyField(c, "customer_id", claims.customerId);
	}

	await next();
};
