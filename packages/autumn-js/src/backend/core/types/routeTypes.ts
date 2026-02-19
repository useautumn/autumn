import type { Autumn } from "@useautumn/sdk";
import type { z } from "zod/v4";
import type { ResolvedIdentity } from "./authTypes";
import type { BackendResult } from "./responseTypes";

/** All supported route names as const for type safety */
export const ROUTE_NAMES = {
	getOrCreateCustomer: "getOrCreateCustomer",
	attach: "attach",
	openCustomerPortal: "openCustomerPortal",
	createReferralCode: "createReferralCode",
	redeemReferralCode: "redeemReferralCode",
	listPlans: "listPlans",
	listEvents: "listEvents",
	aggregateEvents: "aggregateEvents",
} as const;

/** Union of all route names */
export type RouteName = keyof typeof ROUTE_NAMES;

/** Arguments passed to custom handler functions */
export type CustomHandlerArgs = {
	autumn: Autumn;
	identity: ResolvedIdentity | null;
	body: unknown;
};

/** Custom handler function for special route logic */
export type CustomHandlerFn = (
	args: CustomHandlerArgs,
) => Promise<BackendResult | unknown>;

/** Route definition for the backend router */
export type RouteDefinition<T extends RouteName = RouteName> = {
	/** RPC-style route name (e.g., "getOrCreateCustomer", "attach") */
	route: T;
	/** SDK method to call - uses any for dynamic args */
	// biome-ignore lint/suspicious/noExplicitAny: dynamic SDK method args
	sdkMethod: (autumn: Autumn, args: any) => Promise<any>;
	/** Custom handler for special cases (bypasses standard flow) */
	customHandler?: CustomHandlerFn;
	/** Whether customer ID is required (default: true) */
	requireCustomer?: boolean;
	/** Zod schema for request body validation (used by better-auth plugin) */
	bodySchema?: z.ZodTypeAny;
};
