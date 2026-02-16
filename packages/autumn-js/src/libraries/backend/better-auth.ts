import { Autumn } from "@sdk";
import type {
	AuthContext,
	BetterAuthPlugin,
	EndpointContext,
} from "better-auth";
import { getSessionFromCtx } from "better-auth/api";
import { createAuthEndpoint } from "better-auth/plugins";
import {
	APIError,
	createEndpoint,
	type EndpointOptions,
	type Status,
} from "better-call";
import { findRoute } from "rou3";
import { z } from "zod/v4";

import { createRouterWithOptions } from "./routes/backendRouter";
import {
	getIdentityContext,
	getOrganizationContext,
	scopeContainsOrg,
} from "./utils/betterAuth/middlewares";
import type { AutumnOptions } from "./utils/betterAuth/types";
import { secretKeyCheck } from "./utils/secretKeyCheck";

const router = createRouterWithOptions();

const betterAuthPathMap: Record<string, string> = {
	// "create-customer": "customers",
	// "customers/get": "customers",
	checkout: "checkout",
	attach: "attach",
	check: "check",
	track: "track",
	cancel: "cancel",
	"referrals/redeem-code": "referrals/redeem",
	"referrals/create-code": "referrals/code",
	"open-billing-portal": "billing_portal",
	// "products/list": "products",
};

const handleReq = async ({
	ctx,
	options,
	method,
}: {
	ctx: EndpointContext<string, EndpointOptions, AuthContext>;
	options?: AutumnOptions;
	method: string;
}) => {
	const { found, error: resError } = secretKeyCheck();

	if (!found && !options?.secretKey) {
		throw new APIError((resError?.statusCode as Status) ?? "BAD_REQUEST", {
			message: resError?.message ?? "Unknown error",
			code: resError?.code ?? "unknown_error",
		});
	}

	const client = new Autumn({
		serverURL: options?.baseURL,
		secretKey: options?.secretKey,
	});

	let searchParams: Record<string, string> = {};
	try {
		const req = ctx.request as Request;
		const url = new URL(req.url);
		searchParams = Object.fromEntries(url.searchParams);
	} catch (_) {}

	const rest = ctx.path.split("/autumn/")[1];
	const pathname = `/api/autumn/${betterAuthPathMap[rest] || rest}`;

	const match = findRoute(router, method, pathname);

	if (!match) return ctx.json({ error: "Not found" }, { status: 404 });

	const { data } = match;
	const { handler } = data;

	const body = ctx.body;
	const params = ctx.params;
	let identify: unknown;

	// Get organization context (works for both auth and non-auth endpoints)
	const orgContext = await getOrganizationContext(ctx, options);
	const finalSession = await getSessionFromCtx(ctx as any);

	// Get identity context if needed
	let identity = null;
	if (options?.identify) {
		identity = await getIdentityContext({
			orgContext,
			options,
			session: finalSession,
		});
	}

	if (options?.identify) {
		identify = () => identity;
	} else {
		identify = () => {
			if (!finalSession) return;

			if (scopeContainsOrg({ options })) {
				if (orgContext.activeOrganization?.id) {
					return {
						customerId: orgContext.activeOrganization?.id,
						customerData: {
							email: orgContext.activeOrganizationEmail,
							name: orgContext.activeOrganization?.name ?? "",
						},
					};
				} else {
					// 1. If both, return user
					if (options?.customerScope === "user_and_organization") {
						return {
							customerId: (finalSession as any).user.id,
							customerData: {
								email: (finalSession as any).user.email,
								name: (finalSession as any).user.name,
							},
						};
					} else return null;
				}
			} else {
				return {
					customerId: (finalSession as any).user.id,
					customerData: {
						email: (finalSession as any).user.email,
						name: (finalSession as any).user.name,
					},
				};
			}
		};
	}

	const result = await handler({
		autumn: client,
		body: body,
		path: pathname,
		getCustomer: identify,
		pathParams: params,
		searchParams,
	});

	if (result.statusCode >= 400) {
		const errBody = (result.body ?? {}) as {
			message?: string;
			code?: string;
		};
		throw new APIError(result.statusCode, {
			message: errBody.message ?? "Unknown error",
			code: errBody.code ?? "unknown_error",
		});
	}

	if (result.statusCode === 204) {
		return ctx.json(null, { status: 204 });
	}

	return ctx.json(result.body, { status: result.statusCode });
};

export const autumn = (options?: AutumnOptions) => {
	return {
		id: "autumn",
		endpoints: {
			createCustomer: createEndpoint(
				"/autumn/customers",
				{
					method: "POST",
					use: [],
					body: z.object({
						errorOnNotFound: z.boolean().optional(),
						expand: z.array(z.string()).optional(),
					}),
					metadata: {
						isAction: false,
					},
				},
				async (ctx) => await handleReq({ ctx, options, method: "POST" }),
			),
			listProducts: createAuthEndpoint(
				"/autumn/products",
				{
					method: "GET",
					use: [],
				},
				async (ctx) => await handleReq({ ctx, options, method: "GET" }),
			),
			checkout: createAuthEndpoint(
				"/autumn/checkout",
				{
					method: "POST",
					use: [],
					body: z.any(),
				},
				async (ctx) => {
					return await handleReq({ ctx, options, method: "POST" });
				},
			),
			attach: createAuthEndpoint(
				"/autumn/attach",
				{
					method: "POST",
					use: [],
					body: z.any(),
				},
				async (ctx) => await handleReq({ ctx, options, method: "POST" }),
			),
			check: createAuthEndpoint(
				"/autumn/check",
				{
					method: "POST",
					use: [],
					body: z.any(),
				},
				async (ctx) => {
					return await handleReq({ ctx, options, method: "POST" });
				},
			),
			track: createAuthEndpoint(
				"/autumn/track",
				{
					method: "POST",
					use: [],
					body: z.any(),
				},
				async (ctx) => {
					return await handleReq({ ctx, options, method: "POST" });
				},
			),
			cancel: createAuthEndpoint(
				"/autumn/cancel",
				{
					method: "POST",
					use: [],
					body: z.any(),
				},
				async (ctx) => await handleReq({ ctx, options, method: "POST" }),
			),
			createReferralCode: createAuthEndpoint(
				"/autumn/referrals/code",
				{
					method: "POST",
					use: [],
					body: z.any(),
				},
				async (ctx) => {
					return await handleReq({ ctx, options, method: "POST" });
				},
			),
			redeemReferralCode: createAuthEndpoint(
				"/autumn/referrals/redeem",
				{
					method: "POST",
					use: [],
					body: z.any(),
				},
				async (ctx) => {
					return await handleReq({ ctx, options, method: "POST" });
				},
			),
			billingPortal: createAuthEndpoint(
				"/autumn/billing_portal",
				{
					method: "POST",
					use: [],
					body: z.any(),
					metadata: {
						isAction: false,
					},
				},
				async (ctx) => {
					return await handleReq({ ctx, options, method: "POST" });
				},
			),
			createEntity: createAuthEndpoint(
				"/autumn/entities",
				{
					method: "POST",
					use: [],
					body: z.any(),
				},
				async (ctx) => {
					return await handleReq({ ctx, options, method: "POST" });
				},
			),
			getEntity: createAuthEndpoint(
				"/autumn/entities/:entityId",
				{
					method: "GET",
					use: [],
				},
				async (ctx) => {
					return await handleReq({ ctx, options, method: "GET" });
				},
			),
			deleteEntity: createAuthEndpoint(
				"/autumn/entities/:entityId",
				{
					method: "DELETE",
					use: [],
				},
				async (ctx) => await handleReq({ ctx, options, method: "DELETE" }),
			),
		},
	} satisfies BetterAuthPlugin;
};
