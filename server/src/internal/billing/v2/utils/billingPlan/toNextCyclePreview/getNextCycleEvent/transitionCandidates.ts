import type { BillingContext, FullCusProduct } from "@autumn/shared";
import { buildTransitionPoints } from "@/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/buildTransitionPoints";
import { pendingAnchorResets } from "./pendingAnchorResets";
import { isFutureTimestamp, normalizeMs, timestampsEqual } from "./timeUtils";

const getFutureTrialEndsAt = ({
	billingContext,
	customerProducts,
	nowMs,
}: {
	billingContext: BillingContext;
	customerProducts: FullCusProduct[];
	nowMs: number;
}) => {
	const trialEndsAt = [
		billingContext.trialContext?.trialEndsAt,
		...customerProducts.map((customerProduct) => customerProduct.trial_ends_at),
	]
		.filter((timestamp): timestamp is number =>
			isFutureTimestamp({ timestamp, nowMs }),
		)
		.map(normalizeMs)
		.sort((a, b) => a - b);

	return trialEndsAt[0];
};

export const buildNextCycleTransitionPoints = ({
	billingContext,
	customerProducts,
	nowMs,
}: {
	billingContext: BillingContext;
	customerProducts: FullCusProduct[];
	nowMs: number;
}) => {
	const trialEndsAt = getFutureTrialEndsAt({
		billingContext,
		customerProducts,
		nowMs,
	});

	const transitionPoints = buildTransitionPoints({
		customerProducts,
		nowMs,
		trialEndsAt,
		newBillingCycleAnchorMs: [
			...(typeof billingContext.requestedBillingCycleAnchor === "number"
				? [billingContext.requestedBillingCycleAnchor]
				: []),
			...pendingAnchorResets({ billingContext, customerProducts, nowMs }),
		],
	}).filter(
		(timestamp): timestamp is number =>
			typeof timestamp === "number" && timestamp > nowMs,
	);

	return Array.from(
		new Set([
			...transitionPoints.map(normalizeMs),
			...(trialEndsAt ? [trialEndsAt] : []),
		]),
	).sort((a, b) => a - b);
};

export const hasProductTransitionAt = ({
	customerProducts,
	startsAtMs,
}: {
	customerProducts: FullCusProduct[];
	startsAtMs: number;
}) =>
	customerProducts.some(
		(customerProduct) =>
			timestampsEqual(customerProduct.starts_at, startsAtMs) ||
			timestampsEqual(customerProduct.ended_at, startsAtMs),
	);

export const hasTrialEndAt = ({
	billingContext,
	customerProducts,
	startsAtMs,
}: {
	billingContext: BillingContext;
	customerProducts: FullCusProduct[];
	startsAtMs: number;
}) =>
	timestampsEqual(
		billingContext.trialContext?.trialEndsAt ?? undefined,
		startsAtMs,
	) ||
	customerProducts.some((customerProduct) =>
		timestampsEqual(customerProduct.trial_ends_at ?? undefined, startsAtMs),
	);

export const getExactTransitionTimestamp = ({
	billingContext,
	customerProducts,
	startsAtMs,
}: {
	billingContext: BillingContext;
	customerProducts: FullCusProduct[];
	startsAtMs: number;
}) => {
	const exactTimestamps = [
		typeof billingContext.requestedBillingCycleAnchor === "number"
			? billingContext.requestedBillingCycleAnchor
			: undefined,
		billingContext.trialContext?.trialEndsAt,
		...customerProducts.flatMap((customerProduct) => [
			customerProduct.starts_at,
			customerProduct.ended_at ?? undefined,
			customerProduct.trial_ends_at ?? undefined,
			customerProduct.billing_cycle_anchor_resets_at ?? undefined,
		]),
	].filter(
		(timestamp): timestamp is number =>
			typeof timestamp === "number" && timestampsEqual(timestamp, startsAtMs),
	);

	return exactTimestamps.sort((a, b) => a - b)[0] ?? startsAtMs;
};
