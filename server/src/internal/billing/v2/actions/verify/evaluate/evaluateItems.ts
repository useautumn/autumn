import {
	type BasePriceMismatch,
	type ItemMismatch,
	isFixedPrice,
	isPrepaidPrice,
	type PrepaidQuantityMismatch,
	type Price,
	type Product,
	type StripeInlinePrice,
	type SubscriptionMismatch,
} from "@autumn/shared";
import type Stripe from "stripe";
import { stripeInlinePriceMatchesStripePrice } from "@/internal/billing/v2/providers/stripe/utils/matchUtils/matchStripeInlinePrice";
import { findPhaseItemForAutumnPrice } from "@/internal/billing/v2/providers/stripe/utils/sync/autumnToStripe/findPhaseItemForAutumnPrice";
import { findSubscriptionItemForAutumnPrice } from "@/internal/billing/v2/providers/stripe/utils/sync/autumnToStripe/findSubscriptionItemForAutumnPrice";
import type {
	CusPriceCatalog,
	StoredPriceCatalog,
} from "../compute/buildStoredPriceCatalog";
import type { NormalizedItem } from "../compute/types";

type ExpectedPhaseItem = Stripe.SubscriptionScheduleUpdateParams.Phase.Item;

/** Normalizes an actual Stripe subscription item into a comparable format. */
export const normalizeActualSubItem = ({
	item,
}: {
	item: Stripe.SubscriptionItem;
}): NormalizedItem => {
	const autumnCusPriceId = item.metadata?.autumn_customer_price_id;
	return {
		priceId: item.price.id,
		autumnCustomerPriceId: autumnCusPriceId || undefined,
		quantity: item.quantity ?? 0,
		isInline: !!autumnCusPriceId,
		unitAmountDecimal: autumnCusPriceId
			? (item.price.unit_amount_decimal ??
				item.price.unit_amount?.toString() ??
				undefined)
			: undefined,
	};
};

/** Normalizes an actual Stripe schedule phase item into a comparable format. */
export const normalizeActualPhaseItem = ({
	item,
}: {
	item: Stripe.SubscriptionSchedule.Phase.Item;
}): NormalizedItem => {
	const priceId = typeof item.price === "string" ? item.price : item.price.id;
	const autumnCusPriceId = item.metadata?.autumn_customer_price_id;
	const priceObj =
		typeof item.price !== "string" && "unit_amount_decimal" in item.price
			? item.price
			: undefined;
	const unitAmountDecimal =
		autumnCusPriceId && priceObj
			? (priceObj.unit_amount_decimal ??
				priceObj.unit_amount?.toString() ??
				undefined)
			: undefined;
	return {
		priceId,
		autumnCustomerPriceId: autumnCusPriceId || undefined,
		quantity: item.quantity ?? 0,
		isInline: !!autumnCusPriceId,
		unitAmountDecimal,
	};
};

/** Normalizes an expected phase item (from buildStripePhasesUpdate) into a comparable format. */
export const normalizeExpectedPhaseItem = ({
	item,
}: {
	item: ExpectedPhaseItem;
}): NormalizedItem => {
	const hasInlinePrice = "price_data" in item;
	const metadata = item.metadata as Record<string, string> | undefined;

	let unitAmountDecimal: string | undefined;
	if (hasInlinePrice) {
		const priceData = (item as { price_data: StripeInlinePrice }).price_data;
		unitAmountDecimal = priceData.unit_amount_decimal;
	}

	return {
		priceId: hasInlinePrice ? undefined : (item.price as string),
		autumnCustomerPriceId: metadata?.autumn_customer_price_id,
		quantity: (item.quantity as number) ?? 0,
		isInline: hasInlinePrice,
		unitAmountDecimal,
	};
};

/** An actual Stripe item (subscription or schedule-phase), normalized just enough to match on. */
type ActualCandidate = {
	index: number;
	autumnCustomerPriceId?: string;
	autumnPriceId?: string;
	priceId: string;
	price?: Stripe.Price;
};

const buildActualCandidates = ({
	actualSubscriptionItems,
	actualPhaseItems,
}: {
	actualSubscriptionItems?: Stripe.SubscriptionItem[];
	actualPhaseItems?: Stripe.SubscriptionSchedule.Phase.Item[];
}): ActualCandidate[] => {
	if (actualSubscriptionItems) {
		return actualSubscriptionItems.map((item, index) => ({
			index,
			autumnCustomerPriceId: item.metadata?.autumn_customer_price_id,
			autumnPriceId: item.metadata?.autumn_price_id,
			priceId: item.price.id,
			price: item.price,
		}));
	}

	return (actualPhaseItems ?? []).map((item, index) => {
		const metadata = item.metadata as Record<string, string> | undefined;
		const priceObj =
			typeof item.price !== "string" && "unit_amount_decimal" in item.price
				? item.price
				: undefined;
		return {
			index,
			autumnCustomerPriceId: metadata?.autumn_customer_price_id,
			autumnPriceId: metadata?.autumn_price_id,
			priceId: typeof item.price === "string" ? item.price : item.price.id,
			price: priceObj,
		};
	});
};

/**
 * Finds the actual candidate that corresponds to an expected phase item, without reusing
 * a candidate another expected item already claimed.
 *
 * Tier 1 (both kinds): exact `autumn_customer_price_id` metadata match — no shape/amount
 * check, since a mismatched amount is a real discrepancy we want to report, not a reason
 * to fail to find the item in the first place.
 *
 * Tier 2 (fallback, only when metadata identity is absent or stale):
 * - Inline: match by `autumn_price_id` metadata + price-shape equality
 *   (`stripeInlinePriceMatchesStripePrice`). A candidate already tagged with some OTHER
 *   currently-valid inline cusPriceId is excluded — but a stale tag (pointing at a
 *   cusPrice that no longer exists on this customer) does not block the match.
 * - Stored: every known Stripe price id for the Autumn price
 *   (`findSubscriptionItemForAutumnPrice`/`findPhaseItemForAutumnPrice`, via
 *   `getStripePriceIdsForAutumnPrice`) — covers a V1/V2 companion id swap.
 */
const findActualIndex = ({
	expected,
	storedPriceCatalog,
	validInlineCusPriceIds,
	candidates,
	claimed,
	actualSubscriptionItems,
	actualPhaseItems,
}: {
	expected: ExpectedPhaseItem;
	storedPriceCatalog: StoredPriceCatalog;
	validInlineCusPriceIds: Set<string>;
	candidates: ActualCandidate[];
	claimed: Set<number>;
	actualSubscriptionItems?: Stripe.SubscriptionItem[];
	actualPhaseItems?: Stripe.SubscriptionSchedule.Phase.Item[];
}): number | undefined => {
	const isInline = "price_data" in expected;
	const metadata = expected.metadata as Record<string, string> | undefined;
	const available = candidates.filter(
		(candidate) => !claimed.has(candidate.index),
	);

	const identityCusPriceIds = isInline
		? new Set(
				metadata?.autumn_customer_price_id
					? [metadata.autumn_customer_price_id]
					: [],
			)
		: (storedPriceCatalog.get(expected.price as string)?.cusPriceIds ??
			new Set<string>());

	const exact = available.find(
		(candidate) =>
			candidate.autumnCustomerPriceId &&
			identityCusPriceIds.has(candidate.autumnCustomerPriceId),
	);
	if (exact) return exact.index;

	if (isInline) {
		const inlinePrice = (expected as { price_data: StripeInlinePrice })
			.price_data;
		const expectedPriceId = metadata?.autumn_price_id;

		const fallbackMatches = available.filter((candidate) => {
			if (
				candidate.autumnCustomerPriceId &&
				validInlineCusPriceIds.has(candidate.autumnCustomerPriceId)
			) {
				return false;
			}
			if (!expectedPriceId || candidate.autumnPriceId !== expectedPriceId)
				return false;
			if (!candidate.price) return false;
			return stripeInlinePriceMatchesStripePrice({
				inlinePrice,
				stripePrice: candidate.price,
			});
		});

		return fallbackMatches.length === 1 ? fallbackMatches[0]?.index : undefined;
	}

	// Stored fallback: broaden by every known Stripe price id for the Autumn price.
	const priceId = expected.price as string;
	const catalogEntry = storedPriceCatalog.get(priceId);
	const availableIndexes = new Set(
		available.map((candidate) => candidate.index),
	);

	if (actualSubscriptionItems) {
		const availableItems = actualSubscriptionItems.filter((_, index) =>
			availableIndexes.has(index),
		);
		const matched = catalogEntry
			? findSubscriptionItemForAutumnPrice({
					price: catalogEntry.price,
					product: catalogEntry.product,
					stripeSubscriptionItems: availableItems,
				})
			: availableItems.find((item) => item.price.id === priceId);
		return matched ? actualSubscriptionItems.indexOf(matched) : undefined;
	}

	if (actualPhaseItems) {
		const availableItems = actualPhaseItems.filter((_, index) =>
			availableIndexes.has(index),
		);
		const matched = catalogEntry
			? findPhaseItemForAutumnPrice({
					price: catalogEntry.price,
					product: catalogEntry.product,
					phaseItems: availableItems,
				})
			: availableItems.find(
					(item) =>
						(typeof item.price === "string" ? item.price : item.price.id) ===
						priceId,
				);
		return matched ? actualPhaseItems.indexOf(matched) : undefined;
	}

	return undefined;
};

type CatalogEntry = { price: Price; product: Product };

/** Resolves a normalized item back to its Autumn price + product — via the
 * cusPrice-id catalog for inline items (no stable Stripe price id), or the
 * stored-price catalog (keyed by Stripe price id) otherwise. */
const resolvePriceForItem = ({
	item,
	storedPriceCatalog,
	cusPriceCatalog,
}: {
	item: NormalizedItem;
	storedPriceCatalog: StoredPriceCatalog;
	cusPriceCatalog: CusPriceCatalog;
}): CatalogEntry | undefined => {
	if (item.isInline) {
		return item.autumnCustomerPriceId
			? cusPriceCatalog.get(item.autumnCustomerPriceId)
			: undefined;
	}
	return item.priceId ? storedPriceCatalog.get(item.priceId) : undefined;
};

/** Classifies a missing/unexpected expected item into its typed mismatch. */
const buildMissingOrUnexpectedMismatch = ({
	expected,
	actual,
	catalogEntry,
	reason,
	phaseStartsAt,
}: {
	expected?: NormalizedItem;
	actual?: NormalizedItem;
	catalogEntry: CatalogEntry | undefined;
	reason: "missing" | "unexpected";
	phaseStartsAt?: number;
}): SubscriptionMismatch => {
	const price = catalogEntry?.price;

	if (price && isFixedPrice(price)) {
		return {
			type: "base_price_mismatch",
			reason,
			expected_amount: expected?.unitAmountDecimal,
			actual_amount: actual?.unitAmountDecimal,
			phase_starts_at: phaseStartsAt,
		} satisfies BasePriceMismatch;
	}

	if (price && isPrepaidPrice(price)) {
		return {
			type: "prepaid_quantity_mismatch",
			feature_id: price.config.feature_id ?? "unknown",
			expected_quantity: expected?.quantity ?? 0,
			actual_quantity: actual?.quantity ?? 0,
			phase_starts_at: phaseStartsAt,
		} satisfies PrepaidQuantityMismatch;
	}

	return {
		type: "item_mismatch",
		reason,
		feature_id: price?.config.feature_id ?? undefined,
		expected_quantity: expected?.quantity,
		actual_quantity: actual?.quantity,
		phase_starts_at: phaseStartsAt,
	} satisfies ItemMismatch;
};

/**
 * Compares expected phase items against actual Stripe items (subscription or schedule-phase —
 * pass exactly one of `actualSubscriptionItems` / `actualPhaseItems`). Returns typed mismatches
 * instead of throwing.
 */
export const evaluateItems = ({
	expectedRawItems,
	actualSubscriptionItems,
	actualPhaseItems,
	storedPriceCatalog,
	cusPriceCatalog,
	phaseStartsAt,
}: {
	expectedRawItems: ExpectedPhaseItem[];
	actualSubscriptionItems?: Stripe.SubscriptionItem[];
	actualPhaseItems?: Stripe.SubscriptionSchedule.Phase.Item[];
	storedPriceCatalog: StoredPriceCatalog;
	cusPriceCatalog: CusPriceCatalog;
	phaseStartsAt?: number;
}): SubscriptionMismatch[] => {
	const mismatches: SubscriptionMismatch[] = [];

	const expectedItems = expectedRawItems.map((item) =>
		normalizeExpectedPhaseItem({ item }),
	);
	const actualItems = actualSubscriptionItems
		? actualSubscriptionItems.map((item) => normalizeActualSubItem({ item }))
		: (actualPhaseItems ?? []).map((item) =>
				normalizeActualPhaseItem({ item }),
			);

	const candidates = buildActualCandidates({
		actualSubscriptionItems,
		actualPhaseItems,
	});
	const validInlineCusPriceIds = new Set(
		expectedItems
			.filter((item) => item.isInline && item.autumnCustomerPriceId)
			.map((item) => item.autumnCustomerPriceId as string),
	);

	const claimed = new Set<number>();
	const matchedActualIndex = new Map<number, number>();

	for (const [i, rawExpected] of expectedRawItems.entries()) {
		const matchIndex = findActualIndex({
			expected: rawExpected,
			storedPriceCatalog,
			validInlineCusPriceIds,
			candidates,
			claimed,
			actualSubscriptionItems,
			actualPhaseItems,
		});

		if (matchIndex === undefined) continue;
		claimed.add(matchIndex);
		matchedActualIndex.set(i, matchIndex);
	}

	for (let i = 0; i < expectedItems.length; i++) {
		const expected = expectedItems[i];
		const actualIndex = matchedActualIndex.get(i);
		const actual =
			actualIndex !== undefined ? actualItems[actualIndex] : undefined;

		const catalogEntry = resolvePriceForItem({
			item: expected,
			storedPriceCatalog,
			cusPriceCatalog,
		});

		if (!actual) {
			mismatches.push(
				buildMissingOrUnexpectedMismatch({
					expected,
					catalogEntry,
					reason: "missing",
					phaseStartsAt,
				}),
			);
			continue;
		}

		if (actual.quantity !== expected.quantity) {
			const price = catalogEntry?.price;
			if (price && isPrepaidPrice(price)) {
				mismatches.push({
					type: "prepaid_quantity_mismatch",
					feature_id: price.config.feature_id ?? "unknown",
					expected_quantity: expected.quantity,
					actual_quantity: actual.quantity,
					phase_starts_at: phaseStartsAt,
				});
			} else {
				mismatches.push({
					type: "item_mismatch",
					reason: "quantity_mismatch",
					feature_id: price?.config.feature_id ?? undefined,
					expected_quantity: expected.quantity,
					actual_quantity: actual.quantity,
					phase_starts_at: phaseStartsAt,
				});
			}
		}

		if (
			expected.unitAmountDecimal !== undefined &&
			actual.unitAmountDecimal !== undefined &&
			actual.unitAmountDecimal !== expected.unitAmountDecimal
		) {
			const price = catalogEntry?.price;
			if (price && isPrepaidPrice(price)) {
				mismatches.push({
					type: "prepaid_price_mismatch",
					feature_id: price.config.feature_id ?? "unknown",
					expected_unit_amount: expected.unitAmountDecimal,
					actual_unit_amount: actual.unitAmountDecimal,
					phase_starts_at: phaseStartsAt,
				});
			} else if (price && isFixedPrice(price)) {
				mismatches.push({
					type: "base_price_mismatch",
					reason: "amount_mismatch",
					expected_amount: expected.unitAmountDecimal,
					actual_amount: actual.unitAmountDecimal,
					phase_starts_at: phaseStartsAt,
				});
			} else {
				mismatches.push({
					type: "item_mismatch",
					reason: "price_mismatch",
					feature_id: price?.config.feature_id ?? undefined,
					phase_starts_at: phaseStartsAt,
				});
			}
		}
	}

	for (let actualIndex = 0; actualIndex < actualItems.length; actualIndex++) {
		if (claimed.has(actualIndex)) continue;
		const actual = actualItems[actualIndex];
		const catalogEntry = resolvePriceForItem({
			item: actual,
			storedPriceCatalog,
			cusPriceCatalog,
		});
		mismatches.push(
			buildMissingOrUnexpectedMismatch({
				actual,
				catalogEntry,
				reason: "unexpected",
				phaseStartsAt,
			}),
		);
	}

	return mismatches;
};
