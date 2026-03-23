import type { Feature, FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { checkUsageAlerts } from "./checkUsageAlerts.js";
import { handleThresholdReached } from "./handleThresholdReached.js";
import { checkLimitReached } from "./checkLimitReached.js";

export const fireTrackWebhooks = ({
	ctx,
	oldFullCus,
	newFullCus,
	feature,
	entityId,
}: {
	ctx: AutumnContext;
	oldFullCus: FullCustomer;
	newFullCus: FullCustomer;
	feature: Feature;
	entityId?: string;
}) => {
	handleThresholdReached({
		ctx,
		oldFullCus,
		newFullCus,
		feature,
	}).catch((error) => {
		ctx.logger.error(`[fireTrackWebhooks] handleThresholdReached: ${error}`);
	});

	checkUsageAlerts({
		ctx,
		oldFullCus,
		newFullCus,
		feature,
		entityId,
	}).catch((error) => {
		ctx.logger.error(`[fireTrackWebhooks] checkUsageAlerts: ${error}`);
	});

	checkLimitReached({
		ctx,
		oldFullCus,
		newFullCus,
		feature,
		entityId,
	}).catch((error) => {
		ctx.logger.error(`[fireTrackWebhooks] checkLimitReached: ${error}`);
	});
};
