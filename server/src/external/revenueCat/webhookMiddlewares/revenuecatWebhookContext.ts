import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";
import type { LogRevenueCatEventContext } from "@/utils/logging/loggerTypes.js";

export type RevenueCatWebhookContext = AutumnContext & {
	/** Customer ID to invalidate cache for after handler completes */
	customerId?: string;
	/** Event type for logging purposes */
	revenuecatEventType?: string;
	/** Logger before RC context, so context is rebuilt once instead of stacking duplicate keys */
	revenuecatBaseLogger?: Logger;
	revenuecatEvent?: LogRevenueCatEventContext;
};

export type RevenueCatWebhookHonoEnv = Omit<HonoEnv, "Variables"> & {
	Variables: {
		ctx: RevenueCatWebhookContext;
	};
};
