import {
	type Feature,
	type FullCustomer,
	type FullSubject,
	fullSubjectToFullCustomer,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildEvaluationSubject } from "@/internal/balances/check/buildEvaluationSubject.js";
import { getApiCustomerBase } from "@/internal/customers/cusUtils/apiCusUtils/getApiCustomerBase.js";
import { getApiEntityBase } from "@/internal/entities/entityUtils/apiEntityUtils/getApiEntityBase.js";
import { checkLimitReached } from "./checkLimitReached.js";
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

	(async () => {
		let oldEvalSubject: Awaited<ReturnType<typeof buildEvaluationSubject>>;
		let newEvalSubject: Awaited<ReturnType<typeof buildEvaluationSubject>>;

		if (oldFullSubject && newFullSubject) {
			[oldEvalSubject, newEvalSubject] = await Promise.all([
				buildEvaluationSubject({ ctx, fullSubject: oldFullSubject, entityId }),
				buildEvaluationSubject({ ctx, fullSubject: newFullSubject, entityId }),
			]);
		} else {
			const entity = entityId
				? newFullCus.entities?.find((e) => e.id === entityId)
				: undefined;
			const buildSubject = async (fullCus: FullCustomer) => {
				if (entity) {
					const { apiEntity } = await getApiEntityBase({
						ctx,
						entity,
						fullCus,
					});
					return apiEntity;
				}
				const { apiCustomer } = await getApiCustomerBase({ ctx, fullCus });
				return apiCustomer;
			};
			[oldEvalSubject, newEvalSubject] = await Promise.all([
				buildSubject(oldFullCus),
				buildSubject(newFullCus),
			]);
		}

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
