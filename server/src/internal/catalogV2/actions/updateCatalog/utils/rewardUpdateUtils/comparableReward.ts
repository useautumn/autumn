import type {
	ApiCouponV0,
	ApiFeatureGrantV0,
	ApiReferralProgramV0,
} from "@autumn/shared";

type Comparable = Record<string, unknown>;

/** Sorted by the field that names an entry, so array order never reads as a change. */
const orderedBy = <T>({
	entries,
	key,
}: {
	entries: T[];
	key: (entry: T) => string;
}): T[] => [...entries].sort((a, b) => key(a).localeCompare(key(b)));

export const comparableCoupon = (coupon: ApiCouponV0): Comparable => ({
	name: coupon.name ?? null,
	type: coupon.type,
	value: coupon.value,
	duration: {
		type: coupon.duration.type,
		length: coupon.duration.length ?? null,
	},
	plan_ids: coupon.plan_ids === null ? null : [...coupon.plan_ids].sort(),
	promo_codes: orderedBy({
		entries: coupon.promo_codes,
		key: (promoCode) => promoCode.code,
	}).map((promoCode) => ({
		code: promoCode.code,
		global_max_redemption: promoCode.global_max_redemption ?? null,
		first_time_transaction: promoCode.first_time_transaction ?? false,
	})),
});

export const comparableFeatureGrant = (
	featureGrant: ApiFeatureGrantV0,
): Comparable => ({
	name: featureGrant.name ?? null,
	grants: orderedBy({
		entries: featureGrant.grants,
		key: (grant) => grant.feature_id,
	}).map((grant) => ({
		feature_id: grant.feature_id,
		included: grant.included ?? null,
		expiry: grant.expiry ?? null,
	})),
	promo_codes: orderedBy({
		entries: featureGrant.promo_codes,
		key: (promoCode) => promoCode.code,
	}).map((promoCode) => ({
		code: promoCode.code,
		max_uses: promoCode.max_uses ?? null,
	})),
});

export const comparableProgram = (
	program: Omit<ApiReferralProgramV0, "created_at">,
): Comparable => {
	// A program with no plans stores `[""]`, which is the same as none stated.
	const planIds = (program.plan_ids ?? []).filter(Boolean);
	return {
		reward_id: program.reward_id,
		redeem_on: program.redeem_on,
		received_by: program.received_by,
		max_redemptions: program.max_redemptions ?? null,
		plan_ids: planIds.length ? [...planIds].sort() : null,
		exclude_trial: program.exclude_trial ?? false,
	};
};

/**
 * Changed top-level fields holding their PREVIOUS values, matching the shape
 * features already return. Null when the two sides are the same row.
 */
export const previousAttributesOf = ({
	from,
	to,
}: {
	from: Comparable;
	to: Comparable;
}): Record<string, unknown> | null => {
	const changed = Object.entries(from).filter(
		([key, value]) => JSON.stringify(value) !== JSON.stringify(to[key]),
	);
	return changed.length === 0 ? null : Object.fromEntries(changed);
};
