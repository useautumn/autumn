import type { Logger } from "@/external/logtail/logtailUtils.js";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";
import type { LogRevenueCatEventContext } from "@/utils/logging/loggerTypes.js";

export type RevenueCatWebhookContext = AutumnContext & {
	customerId?: string;
	revenuecatEventType?: string;
	revenuecatBaseLogger?: Logger;
	revenuecatEvent?: LogRevenueCatEventContext;
};

export type RevenueCatWebhookHonoEnv = Omit<HonoEnv, "Variables"> & {
	Variables: {
		ctx: RevenueCatWebhookContext;
	};
};
