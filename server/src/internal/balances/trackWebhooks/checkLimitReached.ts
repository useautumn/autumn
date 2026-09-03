import {
	type ApiCustomerV5,
	type ApiEntityV2,
	apiBalanceToAllowed,
	type Feature,
	type FullCustomer,
	type FullSubject,
	fullCustomerToTags,
	fullSubjectToUsageWindowLimits,
	getCurrentUsageWindowUsage,
	orgToInStatuses,
	type UsageLimitFilter,
	type UsageLimitWebhookBlock,
	usageLimitFilterMatchesProperties,
	WebhookEventType,
} from "@autumn/shared";
import { sendSvixEvent } from "@/external/svix/svixHelpers.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { usageWindowLimitToWebhookBlock } from "@/internal/balances/utils/usageWindows/usageWindowLimitToWebhookBlock.js";

type BlockingUsageLimit = {
	block: UsageLimitWebhookBlock;
	filter: UsageLimitFilter | undefined;
};

/**
 * The cap that blocked this event. Enforcement stops at the cap with the least
 * headroom, so the webhook reports that one, filter included, from one source.
 */
const findBlockingUsageLimit = ({
	ctx,
	fullSubject,
	feature,
	eventProperties,
	now,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	feature: Feature;
	eventProperties?: Record<string, unknown> | null;
	now: number;
}): BlockingUsageLimit | undefined => {
	const usageWindows = fullSubject.usage_windows ?? [];
	const measured = fullSubjectToUsageWindowLimits({
		fullSubject,
		featureIds: [feature.id],
		features: ctx.features,
		now,
		inStatuses: orgToInStatuses({ org: ctx.org }),
	})
		.filter((limit) =>
			usageLimitFilterMatchesProperties({
				filterProperties: limit.filter_properties,
				eventProperties,
			}),
		)
		.map((limit) => ({
			limit,
			usage: getCurrentUsageWindowUsage({ usageWindows, limit, now }),
		}))
		.sort(
			(left, right) =>
				left.limit.limit - left.usage - (right.limit.limit - right.usage),
		);

	const tightest = measured[0];
	if (!tightest || tightest.usage < tightest.limit.limit) return undefined;

	const block = usageWindowLimitToWebhookBlock({
		limit: tightest.limit,
		usage: tightest.usage,
	});
	if (!block) return undefined;

	return {
		block,
		filter: tightest.limit.filter_properties
			? { properties: tightest.limit.filter_properties }
			: undefined,
	};
};

/** Legacy deductions carry no FullSubject; read the exhausted filtered cap off the evaluated subject. */
const findBlockedFilterOnSubject = ({
	subject,
	feature,
	eventProperties,
}: {
	subject: ApiCustomerV5 | ApiEntityV2;
	feature: Feature;
	eventProperties?: Record<string, unknown> | null;
}): UsageLimitFilter | undefined =>
	subject.billing_controls?.usage_limits?.find(
		(usageLimit) =>
			usageLimit.feature_id === feature.id &&
			usageLimit.enabled !== false &&
			usageLimit.filter != null &&
			usageLimitFilterMatchesProperties({
				filterProperties: usageLimit.filter.properties,
				eventProperties,
			}) &&
			(usageLimit.usage ?? 0) >= usageLimit.limit,
	)?.filter;

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
