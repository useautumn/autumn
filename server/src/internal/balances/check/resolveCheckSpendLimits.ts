import {
	type ApiCustomerV5,
	type ApiEntityV2,
	type FullCusEntWithFullCusProduct,
	resolveSpendLimitOverageLimit,
} from "@autumn/shared";

// Resolve percentage spend limits to absolute caps for the check evaluation subject.
export const resolveCheckSpendLimits = <
	Subject extends ApiCustomerV5 | ApiEntityV2,
>({
	subject,
	cusEntsForFeature,
	entityId,
}: {
	subject: Subject;
	cusEntsForFeature: (featureId: string) => FullCusEntWithFullCusProduct[];
	entityId?: string;
}): Subject => {
	const spendLimits = subject.billing_controls?.spend_limits;
	if (!spendLimits || spendLimits.length === 0) {
		return subject;
	}

	const resolved = spendLimits.flatMap((spendLimit) => {
		const cusEnts = spendLimit.feature_id
			? cusEntsForFeature(spendLimit.feature_id)
			: [];
		const overageLimit = resolveSpendLimitOverageLimit({
			spendLimit,
			cusEnts,
			entityId,
		});
		return overageLimit === undefined
			? []
			: [
					{
						...spendLimit,
						overage_limit: overageLimit,
						limit_type: "absolute" as const,
					},
				];
	});

	return {
		...subject,
		billing_controls: { ...subject.billing_controls, spend_limits: resolved },
	};
};
