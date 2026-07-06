import {
	type ApiCustomerV5,
	type ApiEntityV2,
	apiBalanceToAllowed,
	type Feature,
	type FullCustomer,
	fullCustomerToTags,
	WebhookEventType,
} from "@autumn/shared";
import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/**
 * Fires balances.limit_reached when a feature crosses from allowed -> blocked.
 *
 * The old/new subjects must already carry plan-level + percentage-resolved
 * billing controls (built via buildEvaluationSubject, the same pipeline the
 * /v1/check path uses). Building them off the raw customer-level controls would
 * miss plan-level spend/usage caps, so the transition would never be seen.
 */
export const checkLimitReached = async ({
	ctx,
	oldEvalSubject,
	newEvalSubject,
	newFullCus,
	feature,
	entityId,
}: {
	ctx: AutumnContext;
	oldEvalSubject: ApiCustomerV5 | ApiEntityV2;
	newEvalSubject: ApiCustomerV5 | ApiEntityV2;
	newFullCus: FullCustomer;
	feature: Feature;
	entityId?: string;
}) => {
	try {
		const oldBalance = oldEvalSubject.balances?.[feature.id];
		const newBalance = newEvalSubject.balances?.[feature.id];

		if (!oldBalance || !newBalance) return;

		const oldResult = apiBalanceToAllowed({
			apiBalance: oldBalance,
			apiSubject: oldEvalSubject,
			feature,
			requiredBalance: 0.0000001,
		});

		const newResult = apiBalanceToAllowed({
			apiBalance: newBalance,
			apiSubject: newEvalSubject,
			feature,
			requiredBalance: 0.0000001,
		});

		if (!oldResult.allowed || newResult.allowed) return;

		const customerId = newFullCus.id || newFullCus.internal_id;
		const tags = fullCustomerToTags({ fullCustomer: newFullCus });

		await sendSvixEvent({
			ctx,
			eventType: WebhookEventType.BalancesLimitReached,
			data: {
				customer_id: customerId,
				feature_id: feature.id,
				limit_type: newResult.limitType ?? "included",
				...(entityId && { entity_id: entityId }),
			},
			tags,
		});

		ctx.logger.info(
			`Limit reached for customer ${customerId}, feature ${feature.id}, type ${newResult.limitType ?? "included"}${entityId ? `, entity ${entityId}` : ""}`,
		);
	} catch (error) {
		ctx.logger.error(`[checkLimitReached] error: ${error}`, { error });
	}
};
