import {
	type Feature,
	type FullCustomer,
	type FullSubject,
	fullSubjectToFullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildEvaluationSubject } from "@/internal/balances/check/buildEvaluationSubject.js";
import { checkLimitReached } from "./checkLimitReached.js";
import { checkLimitReachedLegacy } from "./checkLimitReachedLegacy.js";
import { checkUsageAlerts } from "./checkUsageAlerts.js";
import { handleThresholdReached } from "./handleThresholdReached.js";

export const fireTrackWebhooks = ({
	ctx,
	oldFullSubject,
	newFullSubject,
	oldFullCus: oldFullCusInput,
	newFullCus: newFullCusInput,
	feature,
	entityId,
	featuresFromMutationLogs,
}: {
	ctx: AutumnContext;
	oldFullSubject?: FullSubject;
	newFullSubject?: FullSubject;
	oldFullCus?: FullCustomer;
	newFullCus?: FullCustomer;
	feature: Feature;
	entityId?: string;
	featuresFromMutationLogs?: Feature[];
}) => {
	const oldFullCus = oldFullSubject
		? fullSubjectToFullCustomer({ fullSubject: oldFullSubject })
		: oldFullCusInput;
	const newFullCus = newFullSubject
		? fullSubjectToFullCustomer({ fullSubject: newFullSubject })
		: newFullCusInput;

	if (!oldFullCus || !newFullCus) return;

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

	if (oldFullSubject && newFullSubject) {
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
	} else {
		for (const affectedFeature of featuresForUsageAlertsAndLimit) {
			checkLimitReachedLegacy({
				ctx,
				oldFullCus,
				newFullCus,
				feature: affectedFeature,
				entityId,
			}).catch((error) => {
				ctx.logger.error(
					`[fireTrackWebhooks] checkLimitReachedLegacy: ${error}`,
				);
			});
		}
	}
};
