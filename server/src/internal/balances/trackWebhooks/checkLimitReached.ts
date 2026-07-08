import {
	type ApiCustomerV5,
	type ApiEntityV2,
	apiBalanceToAllowed,
	type Feature,
	type FullCustomer,
	fullCustomerToTags,
	usageLimitFilterMatchesProperties,
	WebhookEventType,
} from "@autumn/shared";
import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

// Subjects must be built via buildEvaluationSubject, or plan-level / percentage
// caps are invisible here and the allowed -> blocked transition never fires.
export const checkLimitReached = async ({
	ctx,
	oldEvalSubject,
	newEvalSubject,
	newFullCus,
	feature,
	entityId,
	eventProperties,
}: {
	ctx: AutumnContext;
	oldEvalSubject: ApiCustomerV5 | ApiEntityV2;
	newEvalSubject: ApiCustomerV5 | ApiEntityV2;
	newFullCus: FullCustomer;
	feature: Feature;
	entityId?: string;
	eventProperties?: Record<string, unknown> | null;
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

		// When the blocking cap is a filtered usage limit, attach its filter so
		// the receiver knows WHICH slice (e.g. which API key) hit its cap.
		const blockedFilter =
			newResult.limitType === "usage_limit" && eventProperties
				? newEvalSubject.billing_controls?.usage_limits?.find(
						(usageLimit) =>
							usageLimit.feature_id === feature.id &&
							usageLimit.enabled !== false &&
							usageLimit.filter != null &&
							usageLimitFilterMatchesProperties({
								filterProperties: usageLimit.filter.properties,
								eventProperties,
							}) &&
							(usageLimit.usage ?? 0) >= usageLimit.limit,
					)?.filter
				: undefined;

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
