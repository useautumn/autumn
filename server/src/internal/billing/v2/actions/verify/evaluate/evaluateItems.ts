import {
	type BasePriceMismatch,
	type ItemMismatch,
	isAllocatedPrice,
	isAllocatedV2Price,
	isConsumablePrice,
	isFixedPrice,
	isPrepaidPrice,
	type Organization,
	type PrepaidQuantityMismatch,
	type Price,
	type Product,
	type StripeInlinePrice,
	type SubscriptionMismatch,
	stripeToAtmnAmount,
} from "@autumn/shared";
import { priceToStripeRecurringParams } from "@utils/productUtils/priceUtils/convertPrice/priceToStripeRecurringParams";
import type Stripe from "stripe";
import { stripePriceToAmount } from "@/external/stripe/prices/utils/convertStripePriceUtils";
import { stripeInlinePriceMatchesStripePrice } from "@/internal/billing/v2/providers/stripe/utils/matchUtils/matchStripeInlinePrice";
import { findPhaseItemForAutumnPrice } from "@/internal/billing/v2/providers/stripe/utils/sync/autumnToStripe/findPhaseItemForAutumnPrice";
import { findSubscriptionItemForAutumnPrice } from "@/internal/billing/v2/providers/stripe/utils/sync/autumnToStripe/findSubscriptionItemForAutumnPrice";
import type {
	CusPriceCatalog,
	StoredPriceCatalog,
} from "../compute/buildStoredPriceCatalog";
import type { NormalizedItem } from "../compute/types";
import {
	findFixedShapeSiblingIndexes,
	findInlineTotalsIndex,
	findPrepaidTotalsIndex,
	findShapeFallbackIndex,
} from "./matchItemByShape";
import { findIdentitySiblingIndexes } from "./matchItemIdentity";

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
		inlineMode: metadata?.inline_mode === "true",
	};
};

/** An actual Stripe item (subscription or schedule-phase), normalized just enough to match on. */
type ActualCandidate = {
	index: number;
	autumnCustomerPriceId?: string;
	autumnPriceId?: string;
	priceId: string;
	price?: Stripe.Price;
	quantity?: number;
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
			quantity: item.quantity,
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
			quantity: item.quantity,
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
 *
 * Tier 3 (stored fixed/prepaid, non-strict only): same-shape licensed item
 * under one of the plan's Stripe product ids (`findShapeFallbackIndex`) —
 * covers imported subs billing their own historical price ids.
 */
const findActualIndex = ({
	expected,
	storedPriceCatalog,
	validInlineCusPriceIds,
	candidates,
	claimed,
	actualSubscriptionItems,
	actualPhaseItems,
	shapeFallback,
}: {
	expected: ExpectedPhaseItem;
	storedPriceCatalog: StoredPriceCatalog;
	validInlineCusPriceIds: Set<string>;
	candidates: ActualCandidate[];
	claimed: Set<number>;
	actualSubscriptionItems?: Stripe.SubscriptionItem[];
	actualPhaseItems?: Stripe.SubscriptionSchedule.Phase.Item[];
	shapeFallback: {
		enabled: boolean;
		org: Organization;
		cusPriceCatalog: CusPriceCatalog;
	};
}): { index: number; viaTotals?: boolean } | undefined => {
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
	if (exact) return { index: exact.index };

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
		const inlineExact = fallbackMatches[0]?.index;
		if (fallbackMatches.length === 1 && inlineExact !== undefined) {
			return { index: inlineExact };
		}

		// Inline-mode rendered items additionally match untagged /
		// stale-tagged items on economic totals.
		const isInlineMode = metadata?.inline_mode === "true";
		if (!isInlineMode || !shapeFallback.enabled) return undefined;
		const totalsIndex = findInlineTotalsIndex({
			inlinePrice,
			expectedQuantity: (expected.quantity as number) ?? 1,
			candidates: available,
			isKnownPriceId: (id) => storedPriceCatalog.has(id),
			isValidCusPriceId: (id) => shapeFallback.cusPriceCatalog.has(id),
		});
		return totalsIndex !== undefined
			? { index: totalsIndex, viaTotals: true }
			: undefined;
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
		if (matched) return { index: actualSubscriptionItems.indexOf(matched) };
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
		if (matched) return { index: actualPhaseItems.indexOf(matched) };
	}

	if (!shapeFallback.enabled || !catalogEntry) return undefined;
	const shapeIndex = findShapeFallbackIndex({
		price: catalogEntry.price,
		product: catalogEntry.product,
		entitlement: catalogEntry.entitlement,
		org: shapeFallback.org,
		candidates: available,
		isKnownPriceId: (id) => storedPriceCatalog.has(id),
		isValidCusPriceId: (id) => shapeFallback.cusPriceCatalog.has(id),
	});
	if (shapeIndex !== undefined) return { index: shapeIndex };

	// Prepaid: the Stripe price's structure is an implementation detail —
	// match the expected total per interval as a last resort.
	if (!catalogEntry.cusEnt) return undefined;
	const totalsIndex = findPrepaidTotalsIndex({
		cusEnt: catalogEntry.cusEnt,
		org: shapeFallback.org,
		candidates: available,
		isKnownPriceId: (id) => storedPriceCatalog.has(id),
		isValidCusPriceId: (id) => shapeFallback.cusPriceCatalog.has(id),
	});
	return totalsIndex !== undefined
		? { index: totalsIndex, viaTotals: true }
		: undefined;
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

/** Items billing nothing as they stand ($0 unit price, quantity 0, or tiers
 * resolving to $0) — non-strict treats them as inert leftovers. */
const isZeroBillingItem = ({
	price,
	quantity,
}: {
	price?: Stripe.Price;
	quantity?: number;
}): boolean => {
	if (price?.recurring?.usage_type !== "licensed") return false;
	const amount = stripePriceToAmount({
		stripePrice: price,
		quantity: quantity ?? 0,
	});
	// Unexpanded tiers make the amount unknowable — quantity 0 bills nothing.
	if (amount === null) return quantity === 0;
	return amount <= 0.5;
};

const priceTypeOf = (price?: Price): ItemMismatch["price_type"] => {
	if (!price) return undefined;
	if (isPrepaidPrice(price)) return "prepaid";
	if (isConsumablePrice(price)) return "usage";
	if (isAllocatedPrice(price)) return "allocated";
	if (isFixedPrice(price)) return "fixed";
	return undefined;
};

/** Consumable / allocated-V2 prices bill as posted invoice line items — a
 * missing Stripe item is fine as long as another item invoices at the same
 * interval. Prorated allocated prices still need their Stripe quantity item. */
const missingUsageItemCovered = ({
	price,
	candidates,
}: {
	price?: Price;
	candidates: ActualCandidate[];
}): boolean => {
	if (!price) return false;
	if (!isConsumablePrice(price) && !isAllocatedV2Price(price)) return false;

	const recurring = priceToStripeRecurringParams({ price });
	if (!recurring) return false;

	return candidates.some(
		(candidate) =>
			candidate.price?.recurring?.interval === recurring.interval &&
			(candidate.price?.recurring?.interval_count ?? 1) ===
				(recurring.interval_count ?? 1),
	);
};

/** Major-unit display context read off an actual Stripe item's price. */
const displayFromStripePrice = (
	stripePrice?: Stripe.Price,
): Pick<
	ItemMismatch,
	"price_amount" | "price_interval" | "price_interval_count"
> => {
	if (stripePrice?.unit_amount == null) return {};
	return {
		price_amount: stripeToAtmnAmount({
			amount: stripePrice.unit_amount,
			currency: stripePrice.currency,
		}),
		price_interval: stripePrice.recurring?.interval,
		price_interval_count: stripePrice.recurring?.interval_count,
	};
};

/** Plan + major-unit price display context for a fixed catalog price. */
const displayFromFixedPrice = (
	catalogEntry?: CatalogEntry,
): Pick<
	ItemMismatch,
	"plan_name" | "price_amount" | "price_interval" | "price_interval_count"
> => {
	const price = catalogEntry?.price;
	if (!price || !isFixedPrice(price)) return {};
	return {
		plan_name: catalogEntry.product.name ?? undefined,
		price_amount: price.config.amount ?? undefined,
		price_interval: price.config.interval ?? undefined,
		price_interval_count: price.config.interval_count ?? undefined,
	};
};

/** Classifies a missing/unexpected expected item into its typed mismatch. */
const buildMissingOrUnexpectedMismatch = ({
	expected,
	actual,
	actualStripePrice,
	catalogEntry,
	reason,
	phaseStartsAt,
}: {
	expected?: NormalizedItem;
	actual?: NormalizedItem;
	actualStripePrice?: Stripe.Price;
	catalogEntry: CatalogEntry | undefined;
	reason: "missing" | "unexpected";
	phaseStartsAt?: number;
}): SubscriptionMismatch => {
	const price = catalogEntry?.price;

	if (price && isFixedPrice(price)) {
		return {
			type: "base_price_mismatch",
			reason,
			expected_price_id: expected?.priceId,
			actual_price_id: actual?.priceId,
			expected_amount: expected?.unitAmountDecimal,
			actual_amount: actual?.unitAmountDecimal,
			plan_name: catalogEntry?.product.name ?? undefined,
			price_amount: price.config.amount ?? undefined,
			price_interval: price.config.interval ?? undefined,
			price_interval_count: price.config.interval_count ?? undefined,
			expected_quantity: expected?.quantity,
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
		expected_price_id: expected?.priceId,
		actual_price_id: actual?.priceId,
		price_type: priceTypeOf(price),
		feature_id: price?.config.feature_id ?? undefined,
		expected_quantity: expected?.quantity,
		actual_quantity: actual?.quantity,
		...displayFromStripePrice(actualStripePrice),
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
	org,
	phaseStartsAt,
	strict = false,
}: {
	expectedRawItems: ExpectedPhaseItem[];
	actualSubscriptionItems?: Stripe.SubscriptionItem[];
	actualPhaseItems?: Stripe.SubscriptionSchedule.Phase.Item[];
	storedPriceCatalog: StoredPriceCatalog;
	cusPriceCatalog: CusPriceCatalog;
	org: Organization;
	phaseStartsAt?: number;
	strict?: boolean;
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
	const totalsMatched = new Set<number>();
	const shapeFallback = { enabled: !strict, org, cusPriceCatalog };

	for (const [i, rawExpected] of expectedRawItems.entries()) {
		const match = findActualIndex({
			expected: rawExpected,
			storedPriceCatalog,
			validInlineCusPriceIds,
			candidates,
			claimed,
			actualSubscriptionItems,
			actualPhaseItems,
			shapeFallback,
		});

		if (match === undefined) continue;
		claimed.add(match.index);
		matchedActualIndex.set(i, match.index);
		if (match.viaTotals) totalsMatched.add(i);
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

		// A consolidated expected item can be billed across several Stripe
		// items — claim its siblings and compare the aggregate quantity.
		let siblingQuantity = 0;
		const claimSiblings = (indexes: number[]) => {
			for (const index of indexes) {
				claimed.add(index);
				siblingQuantity += candidates[index]?.quantity ?? 0;
			}
		};
		const unclaimedCandidates = () =>
			candidates.filter((candidate) => !claimed.has(candidate.index));

		if (!expected.isInline && catalogEntry) {
			// Identity siblings (metadata / price id) hold in strict mode too.
			claimSiblings(
				findIdentitySiblingIndexes({
					expectedPriceId: expected.priceId,
					identityCusPriceIds: expected.priceId
						? (storedPriceCatalog.get(expected.priceId)?.cusPriceIds ??
							new Set<string>())
						: new Set<string>(),
					candidates: unclaimedCandidates(),
				}),
			);

			if (!strict && isFixedPrice(catalogEntry.price)) {
				claimSiblings(
					findFixedShapeSiblingIndexes({
						price: catalogEntry.price,
						product: catalogEntry.product,
						candidates: unclaimedCandidates(),
						isKnownPriceId: (id) => storedPriceCatalog.has(id),
						isValidCusPriceId: (id) => cusPriceCatalog.has(id),
					}),
				);
			}
		}

		if (!actual) {
			if (siblingQuantity > 0) {
				if (siblingQuantity !== expected.quantity) {
					mismatches.push({
						type: "item_mismatch",
						reason: "quantity_mismatch",
						price_type: priceTypeOf(catalogEntry?.price),
						feature_id: catalogEntry?.price.config.feature_id ?? undefined,
						expected_quantity: expected.quantity,
						actual_quantity: siblingQuantity,
						...displayFromFixedPrice(catalogEntry),
						phase_starts_at: phaseStartsAt,
					});
				}
				continue;
			}
			if (
				!strict &&
				missingUsageItemCovered({ price: catalogEntry?.price, candidates })
			) {
				continue;
			}
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

		// A totals match already proved economic equality.
		if (totalsMatched.has(i)) continue;

		// Inline-mode items carry their own quantity model (qty 1 × total) —
		// compare economic totals instead of per-field qty/amount.
		if (expected.inlineMode) {
			const candidatePrice =
				actualIndex !== undefined ? candidates[actualIndex]?.price : undefined;
			const actualUnit =
				actual.unitAmountDecimal ??
				candidatePrice?.unit_amount_decimal ??
				candidatePrice?.unit_amount?.toString();
			const expectedTotal =
				expected.quantity * Number(expected.unitAmountDecimal);
			const actualTotal = actual.quantity * Number(actualUnit);
			if (
				Number.isFinite(expectedTotal) &&
				Number.isFinite(actualTotal) &&
				Math.abs(expectedTotal - actualTotal) > 0.5
			) {
				const price = catalogEntry?.price;
				if (price && isPrepaidPrice(price)) {
					mismatches.push({
						type: "prepaid_price_mismatch",
						feature_id: price.config.feature_id ?? "unknown",
						expected_unit_amount: String(expectedTotal),
						actual_unit_amount: String(actualTotal),
						phase_starts_at: phaseStartsAt,
					});
				} else {
					mismatches.push({
						type: "base_price_mismatch",
						reason: "amount_mismatch",
						expected_amount: String(expectedTotal),
						actual_amount: String(actualTotal),
						phase_starts_at: phaseStartsAt,
					});
				}
			}
			continue;
		}

		const effectiveQuantity = actual.quantity + siblingQuantity;
		if (effectiveQuantity !== expected.quantity) {
			const price = catalogEntry?.price;
			if (price && isPrepaidPrice(price)) {
				mismatches.push({
					type: "prepaid_quantity_mismatch",
					feature_id: price.config.feature_id ?? "unknown",
					expected_quantity: expected.quantity,
					actual_quantity: effectiveQuantity,
					phase_starts_at: phaseStartsAt,
				});
			} else {
				mismatches.push({
					type: "item_mismatch",
					reason: "quantity_mismatch",
					price_type: priceTypeOf(price),
					feature_id: price?.config.feature_id ?? undefined,
					expected_quantity: expected.quantity,
					actual_quantity: effectiveQuantity,
					...displayFromFixedPrice(catalogEntry),
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
					price_type: priceTypeOf(price),
					feature_id: price?.config.feature_id ?? undefined,
					phase_starts_at: phaseStartsAt,
				});
			}
		}
	}

	for (let actualIndex = 0; actualIndex < actualItems.length; actualIndex++) {
		if (claimed.has(actualIndex)) continue;
		if (
			!strict &&
			candidates[actualIndex]?.price?.recurring?.usage_type === "metered"
		) {
			continue;
		}
		if (
			!strict &&
			isZeroBillingItem({
				price: candidates[actualIndex]?.price,
				quantity: candidates[actualIndex]?.quantity,
			})
		) {
			continue;
		}
		const actual = actualItems[actualIndex];
		const catalogEntry = resolvePriceForItem({
			item: actual,
			storedPriceCatalog,
			cusPriceCatalog,
		});
		mismatches.push(
			buildMissingOrUnexpectedMismatch({
				actual,
				actualStripePrice: candidates[actualIndex]?.price,
				catalogEntry,
				reason: "unexpected",
				phaseStartsAt,
			}),
		);
	}

	return mismatches;
};
