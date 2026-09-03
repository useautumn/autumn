import {
	type ApiCustomerV5,
	type ApiEntityV2,
	apiBalanceToAllowed,
	type Feature,
	type FullCustomer,
	type FullSubject,
	fullCustomerToTags,
	WebhookEventType,
} from "@autumn/shared";
import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { findBlockedFilterOnSubject } from "./limitReached/findBlockedFilterOnSubject.js";
import { findBlockingUsageLimit } from "./limitReached/findBlockingUsageLimit.js";

// Subjects must be built via buildEvaluationSubject, or plan-level / percentage
// caps are invisible here and the allowed -> blocked transition never fires.
export const checkLimitReached = async ({
	ctx,
	oldEvalSubject,
	newEvalSubject,
	newFullCus,
	newFullSubject,
	feature,
	entityId,
	eventProperties,
	now = Date.now(),
}: {
	ctx: AutumnContext;
	oldEvalSubject: ApiCustomerV5 | ApiEntityV2;
	newEvalSubject: ApiCustomerV5 | ApiEntityV2;
	newFullCus: FullCustomer;
	newFullSubject?: FullSubject;
	feature: Feature;
	entityId?: string;
	eventProperties?: Record<string, unknown> | null;
	now?: number;
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
			properties: eventProperties,
		});

		const newResult = apiBalanceToAllowed({
			apiBalance: newBalance,
			apiSubject: newEvalSubject,
			feature,
			requiredBalance: 0.0000001,
			properties: eventProperties,
		});

		if (!oldResult.allowed || newResult.allowed) return;

		const blockedByUsageLimit = newResult.limitType === "usage_limit";
		const blocking =
			blockedByUsageLimit && newFullSubject
				? findBlockingUsageLimit({
						ctx,
						fullSubject: newFullSubject,
						feature,
						eventProperties,
						now,
					})
				: undefined;
		const blockedFilter =
			blocking?.filter ??
			(blockedByUsageLimit && eventProperties
				? findBlockedFilterOnSubject({
						subject: newEvalSubject,
						feature,
						eventProperties,
					})
				: undefined);

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
				...(blockedFilter && { filter: blockedFilter }),
				...(blocking && { usage_limit: blocking.block }),
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
