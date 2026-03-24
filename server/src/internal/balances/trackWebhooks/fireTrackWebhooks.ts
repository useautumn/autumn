import type { Feature, FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { checkLimitReached } from "./checkLimitReached.js";
import { checkUsageAlerts } from "./checkUsageAlerts.js";
import { handleThresholdReached } from "./handleThresholdReached.js";

export const fireTrackWebhooks = ({
	ctx,
	oldFullCus,
	newFullCus,
	feature,
	entityId,
	featuresFromMutationLogs,
}: {
	ctx: AutumnContext;
	oldFullCus: FullCustomer;
	newFullCus: FullCustomer;
	feature: Feature;
	entityId?: string;
	featuresFromMutationLogs?: Feature[];
}) => {
	handleThresholdReached({
		ctx,
		oldFullCus,
		newFullCus,
		feature,
	}).catch((error) => {
		ctx.logger.error(`[fireTrackWebhooks] handleThresholdReached: ${error}`);
	});

	const featuresForUsageAlertsAndLimit =
		featuresFromMutationLogs && featuresFromMutationLogs.length > 0
			? featuresFromMutationLogs
			: [feature];

	for (const affectedFeature of featuresForUsageAlertsAndLimit) {
		checkUsageAlerts({
			ctx,
			oldFullCus,
			newFullCus,
			feature: affectedFeature,
			entityId,
		}).catch((error) => {
			ctx.logger.error(`[fireTrackWebhooks] checkUsageAlerts: ${error}`);
		});

		checkLimitReached({
			ctx,
			oldFullCus,
			newFullCus,
			feature: affectedFeature,
			entityId,
		}).catch((error) => {
			ctx.logger.error(`[fireTrackWebhooks] checkLimitReached: ${error}`);
		});
	}
};
