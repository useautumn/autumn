/**
 * newlyAdoptedPrices / meterDecision / priceRequiresMeter — the pure decisions
 * behind adopted-price validation.
 *
 * Contract:
 *   every newly-stated SLOT is validated, not just the first one found
 *   "carried forward" is per price row + slot, so an id moved between rows is new
 *   a mint's cloned ids stay exempt (Autumn wrote them, they were real)
 *   adopting a metered price records the meter; adopting a meterless one CLEARS it
 *   a usage-based price may not adopt a meterless Stripe price at all
 */

import { describe, expect, test } from "bun:test";
import { BillWhen, PriceType } from "@autumn/shared";
import {
	meterDecision,
	newlyAdoptedPrices,
	priceRequiresMeter,
} from "@/internal/catalogV2/execute/executeInitStripeResources/validateAdoptedStripePrices";

const price = ({ id, config }: { id: string; config: object }) =>
	({ id, config }) as never;

const product = ({ prices }: { prices: unknown[] }) =>
	({ id: "pro", prices }) as never;

const upsert = ({
	next,
	current,
	base,
}: {
	next: unknown;
	current?: unknown;
	base?: unknown;
}) =>
	({
		row: {
			nextFullProduct: next,
			currentFullProduct: current ?? null,
			baseFullProduct: base ?? null,
		},
	}) as never;

describe("newlyAdoptedPrices", () => {
	test("emits one entry per newly-stated slot", () => {
		const adopted = newlyAdoptedPrices({
			upsert: upsert({
				next: product({
					prices: [
						price({
							id: "p1",
							config: {
								stripe_price_id: "price_v1_new",
								stripe_prepaid_price_v2_id: "price_v2_new",
							},
						}),
					],
				}),
			}),
		});

		expect(adopted.map((entry) => entry.stripePriceId).sort()).toEqual([
			"price_v1_new",
			"price_v2_new",
		]);
	});

	test("an id unchanged on its own row is carried forward, not re-validated", () => {
		const adopted = newlyAdoptedPrices({
			upsert: upsert({
				next: product({
					prices: [price({ id: "p1", config: { stripe_price_id: "price_a" } })],
				}),
				current: product({
					prices: [price({ id: "p1", config: { stripe_price_id: "price_a" } })],
				}),
			}),
		});

		expect(adopted).toEqual([]);
	});

	test("an id moved to a different price row counts as newly stated", () => {
		const adopted = newlyAdoptedPrices({
			upsert: upsert({
				next: product({
					prices: [
						price({ id: "p1", config: {} }),
						price({ id: "p2", config: { stripe_price_id: "price_a" } }),
					],
				}),
				current: product({
					prices: [
						price({ id: "p1", config: { stripe_price_id: "price_a" } }),
						price({ id: "p2", config: {} }),
					],
				}),
			}),
		});

		expect(adopted.map((entry) => entry.stripePriceId)).toEqual(["price_a"]);
		expect(adopted[0]?.price.id).toBe("p2");
	});

	test("ids cloned by a mint stay exempt", () => {
		const adopted = newlyAdoptedPrices({
			upsert: upsert({
				next: product({
					prices: [
						price({ id: "fresh", config: { stripe_price_id: "price_minted" } }),
					],
				}),
				base: product({
					prices: [
						price({ id: "old", config: { stripe_price_id: "price_minted" } }),
					],
				}),
			}),
		});

		expect(adopted).toEqual([]);
	});
});

describe("meterDecision", () => {
	test("adopts the meter a metered price carries", () => {
		expect(
			meterDecision({
				stripePrice: { recurring: { meter: "mtr_new" } } as never,
				config: {},
			}),
		).toEqual({ type: "adopt", meterId: "mtr_new" });
	});

	test("same meter is unchanged", () => {
		expect(
			meterDecision({
				stripePrice: { recurring: { meter: "mtr_a" } } as never,
				config: { stripe_meter_id: "mtr_a" },
			}),
		).toEqual({ type: "unchanged" });
	});

	test("re-mapping onto a meterless price clears the stale meter", () => {
		expect(
			meterDecision({
				stripePrice: { recurring: null } as never,
				config: { stripe_meter_id: "mtr_old", stripe_event_name: "old_event" },
			}),
		).toEqual({ type: "clear" });
	});

	test("meterless price with no stored meter is unchanged", () => {
		expect(
			meterDecision({
				stripePrice: { recurring: null } as never,
				config: {},
			}),
		).toEqual({ type: "unchanged" });
	});
});

describe("priceRequiresMeter", () => {
	const consumable = price({
		id: "usage",
		config: {
			type: PriceType.Usage,
			bill_when: BillWhen.EndOfPeriod,
			interval: "month",
		},
	});

	test("a usage-based price needs a meter", () => {
		expect(
			priceRequiresMeter({
				price: consumable,
				product: product({ prices: [consumable] }),
			}),
		).toBe(true);
	});

	test("a fixed base price does not", () => {
		const fixed = price({
			id: "base",
			config: { type: PriceType.Fixed, amount: 20, interval: "month" },
		});
		expect(
			priceRequiresMeter({
				price: fixed,
				product: product({ prices: [fixed] }),
			}),
		).toBe(false);
	});
});
