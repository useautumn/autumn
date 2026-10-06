import { describe, expect, test } from "bun:test";
import type { Organization } from "@autumn/shared";
import type Stripe from "stripe";
import { evaluateItems } from "@/internal/billing/v2/actions/verify/evaluate/evaluateItems";

const PLACEHOLDER_METADATA = { autumn_free_phase_placeholder: "true" };

const expectedPlaceholder = {
	price_data: {
		product: "prod_free",
		unit_amount: 0,
		currency: "usd",
		recurring: { interval: "month" as const },
	},
	quantity: 1,
	metadata: PLACEHOLDER_METADATA,
};

const actualPhaseItem = ({ metadata }: { metadata: Record<string, string> }) =>
	({
		price: {
			id: "price_inline_zero",
			unit_amount: 0,
			unit_amount_decimal: "0",
			currency: "usd",
			recurring: {
				interval: "month",
				interval_count: 1,
				usage_type: "licensed",
			},
		},
		quantity: 1,
		metadata,
	}) as unknown as Stripe.SubscriptionSchedule.Phase.Item;

const evaluate = (actualPhaseItems: Stripe.SubscriptionSchedule.Phase.Item[]) =>
	evaluateItems({
		expectedRawItems: [expectedPlaceholder],
		actualPhaseItems,
		storedPriceCatalog: new Map(),
		cusPriceCatalog: new Map(),
		org: { default_currency: "usd" } as Organization,
	});

describe("verify: free phase placeholder", () => {
	test("matches the placeholder Stripe item by its marker", () => {
		expect(
			evaluate([actualPhaseItem({ metadata: PLACEHOLDER_METADATA })]),
		).toEqual([]);
	});

	test("still reports a missing placeholder", () => {
		expect(evaluate([actualPhaseItem({ metadata: {} })])).toMatchObject([
			{ type: "item_mismatch", reason: "missing", expected_quantity: 1 },
		]);
	});
});
