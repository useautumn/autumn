import {
	BillingMethod,
	billingToItemInterval,
	type CheckoutChange,
	type ProductItem,
	resetIntvToItemIntv,
	UsageModel,
} from "@autumn/shared";

/**
 * Converts outgoing checkout changes into baseline ProductItems for diff comparison.
 * Uses outgoing plan configuration and merges duplicate feature rows across plans.
 */
type AggregateByFeature = {
	candidates: ProductItem[];
	hasUnlimited: boolean;
	includedUsageSum: number;
};

function tiersAreEqual({
	tiersA,
	tiersB,
}: {
	tiersA?: ProductItem["tiers"];
	tiersB?: ProductItem["tiers"];
}) {
	if (!tiersA && !tiersB) {
		return true;
	}

	if (!tiersA || !tiersB) {
		return false;
	}

	if (tiersA.length !== tiersB.length) {
		return false;
	}

	return tiersA.every(
		(tier, index) =>
			tier.amount === tiersB[index]?.amount && tier.to === tiersB[index]?.to,
	);
}

function scoreCandidateSimilarity({
	candidate,
	incomingItem,
}: {
	candidate: ProductItem;
	incomingItem: ProductItem;
}) {
	let score = 0;

	if (tiersAreEqual({ tiersA: candidate.tiers, tiersB: incomingItem.tiers })) {
		score += 4;
	}
	if (candidate.price === incomingItem.price) {
		score += 3;
	}
	if (candidate.billing_units === incomingItem.billing_units) {
		score += 2;
	}
	if (candidate.usage_model === incomingItem.usage_model) {
		score += 1;
	}
	if (candidate.interval === incomingItem.interval) {
		score += 1;
	}
	if (candidate.interval_count === incomingItem.interval_count) {
		score += 1;
	}

	return score;
}

const hasNonNullValue = (value: unknown) =>
	value !== null && value !== undefined;

function normalizeCandidateForIncoming({
	candidate,
	incomingItem,
}: {
	candidate: ProductItem;
	incomingItem: ProductItem;
}): ProductItem {
	const incomingHasTiers = (incomingItem.tiers?.length ?? 0) > 0;
	const incomingHasPrice = hasNonNullValue(incomingItem.price);

	const candidateHasTiers = (candidate.tiers?.length ?? 0) > 0;
	const candidateHasPrice = hasNonNullValue(candidate.price);

	// Equivalent usage-based configs can be represented as either:
	// 1) price.amount (no tiers), or
	// 2) a single infinite tier.
	// Align to incoming representation to avoid false "added tier"/"price changed" edits.
	if (
		incomingHasTiers &&
		!incomingHasPrice &&
		!candidateHasTiers &&
		candidateHasPrice
	) {
		return {
			...candidate,
			price: undefined,
			tiers: [{ to: "inf", amount: candidate.price as number }],
		};
	}

	if (
		incomingHasPrice &&
		!incomingHasTiers &&
		candidateHasTiers &&
		!candidateHasPrice
	) {
		const singleInfiniteTier =
			candidate.tiers?.length === 1 && candidate.tiers[0]?.to === "inf";

		if (singleInfiniteTier) {
			return {
				...candidate,
				price: candidate.tiers?.[0]?.amount,
				tiers: undefined,
			};
		}
	}

	return candidate;
}

function planItemToProductItem({
	planItem,
}: {
	planItem: CheckoutChange["plan"]["items"][number];
}): ProductItem {
	const interval = planItem.reset?.interval
		? resetIntvToItemIntv(planItem.reset.interval)
		: planItem.price?.interval
			? billingToItemInterval({ billingInterval: planItem.price.interval })
			: null;

	const usageModel =
		planItem.price?.billing_method === BillingMethod.Prepaid
			? UsageModel.Prepaid
			: planItem.price?.billing_method === BillingMethod.UsageBased
				? UsageModel.PayPerUse
				: undefined;

	return {
		feature_id: planItem.feature_id,
		included_usage: planItem.unlimited ? "inf" : planItem.included,
		price: planItem.price?.amount,
		tiers: planItem.price?.tiers,
		billing_units: planItem.price?.billing_units,
		usage_model: usageModel,
		interval,
		interval_count:
			planItem.reset?.interval_count ?? planItem.price?.interval_count,
		entity_feature_id: planItem.entity_feature_id,
	};
}

export function outgoingToProductItems({
	outgoing,
	incomingItems,
}: {
	outgoing: CheckoutChange[] | undefined;
	incomingItems: ProductItem[] | undefined;
}): ProductItem[] {
	if (!outgoing || outgoing.length === 0) {
		return [];
	}

	const incomingByFeature = new Map<string, ProductItem>(
		(incomingItems ?? [])
			.filter((item): item is ProductItem & { feature_id: string } =>
				Boolean(item.feature_id),
			)
			.map((item) => [item.feature_id, item]),
	);

	const aggregatedByFeature = new Map<string, AggregateByFeature>();

	for (const change of outgoing) {
		for (const planItem of change.plan.items) {
			const productItem = planItemToProductItem({ planItem });
			const featureId = productItem.feature_id;

			if (!featureId) {
				continue;
			}

			const aggregate = aggregatedByFeature.get(featureId) ?? {
				candidates: [],
				hasUnlimited: false,
				includedUsageSum: 0,
			};

			aggregate.candidates.push(productItem);
			if (productItem.included_usage === "inf") {
				aggregate.hasUnlimited = true;
			} else if (typeof productItem.included_usage === "number") {
				aggregate.includedUsageSum += productItem.included_usage;
			}

			aggregatedByFeature.set(featureId, aggregate);
		}
	}

	const mergedItems: ProductItem[] = [];

	for (const [featureId, aggregate] of aggregatedByFeature.entries()) {
		const incomingItem = incomingByFeature.get(featureId);
		const [firstCandidate] = aggregate.candidates;

		if (!firstCandidate) {
			continue;
		}

		let selectedConfig = firstCandidate;

		if (incomingItem) {
			let bestScore = Number.NEGATIVE_INFINITY;
			for (const outgoingItem of aggregate.candidates) {
				const normalizedCandidate = normalizeCandidateForIncoming({
					candidate: outgoingItem,
					incomingItem,
				});

				const score = scoreCandidateSimilarity({
					candidate: normalizedCandidate,
					incomingItem,
				});

				if (score > bestScore) {
					bestScore = score;
					selectedConfig = normalizedCandidate;
				}
			}
		}

		mergedItems.push({
			...selectedConfig,
			included_usage: aggregate.hasUnlimited
				? "inf"
				: aggregate.includedUsageSum,
		});
	}

	return mergedItems;
}
