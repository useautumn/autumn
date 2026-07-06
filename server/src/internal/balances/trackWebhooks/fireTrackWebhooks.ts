import {
	type Feature,
	type FullSubject,
	fullSubjectToFullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildEvaluationSubject } from "@/internal/balances/check/buildEvaluationSubject.js";
import { checkLimitReached } from "./checkLimitReached.js";
import { checkUsageAlerts } from "./checkUsageAlerts.js";
import { handleThresholdReached } from "./handleThresholdReached.js";

export const fireTrackWebhooks = ({
	ctx,
	oldFullSubject,
	newFullSubject,
	feature,
	entityId,
	featuresFromMutationLogs,
}: {
	ctx: AutumnContext;
	oldFullSubject: FullSubject;
	newFullSubject: FullSubject;
	feature: Feature;
	entityId?: string;
	featuresFromMutationLogs?: Feature[];
}) => {
	const oldFullCus = fullSubjectToFullCustomer({ fullSubject: oldFullSubject });
	const newFullCus = fullSubjectToFullCustomer({ fullSubject: newFullSubject });

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
	}

	// Build the old/new evaluation subjects once (plan-level + percentage-resolved
	// billing controls, matching the /v1/check path), then detect the
	// allowed -> blocked transition per affected feature.
	(async () => {
		const [oldEvalSubject, newEvalSubject] = await Promise.all([
			buildEvaluationSubject({ ctx, fullSubject: oldFullSubject, entityId }),
			buildEvaluationSubject({ ctx, fullSubject: newFullSubject, entityId }),
		]);

		for (const affectedFeature of featuresForUsageAlertsAndLimit) {
			await checkLimitReached({
				ctx,
				oldEvalSubject,
				newEvalSubject,
				newFullCus,
				feature: affectedFeature,
				entityId,
			});
		}
	})().catch((error) => {
		ctx.logger.error(`[fireTrackWebhooks] checkLimitReached: ${error}`);
	});
};
