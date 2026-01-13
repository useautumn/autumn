import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";

export type RevenueCatWebhookContext = AutumnContext & {
	/** Customer ID to invalidate cache for after handler completes */
	customerId?: string;
	/** Event type for logging purposes */
	revenuecatEventType?: string;
};

export type RevenueCatWebhookHonoEnv = Omit<HonoEnv, "Variables"> & {
	Variables: {
		ctx: RevenueCatWebhookContext;
	};
};
