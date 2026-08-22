import { describe, expect, test } from "bun:test";
import type { FullCusProduct, FullProduct } from "@autumn/shared";
import {
	AllowanceType,
	deriveCustomerProductIsCustom,
	EntInterval,
	FeatureType,
} from "@autumn/shared";

/**
 * `is_custom` is derived by comparing a customer product's own price and
 * entitlement rows against the catalog version it points at.
 *
 * The false-negative cases matter most: a customer product wrongly read as
 * non-custom is swept into version migrations, which overwrite the very rows
 * that made it custom. False positives only mean the customer is skipped.
 */

const seatsEntitlement = ({
	allowance = 5,
	rollover = null,
	id = "ent_seats",
}: {
	allowance?: number;
	rollover?: unknown;
	id?: string;
} = {}) =>
	({
		id,
		internal_feature_id: "if_seats",
		feature_id: "seats",
		feature: { id: "seats", type: FeatureType.Metered },
		allowance,
		allowance_type: AllowanceType.Fixed,
		interval: EntInterval.Month,
		interval_count: 1,
		entity_feature_id: null,
		pooled: false,
		carry_from_previous: false,
		rollover,
		created_at: 1,
	}) as never;

/** A $8/month base price, optionally also priced in other currencies. */
const basePrice = ({
	amount = 8,
	currencies,
}: {
	amount?: number;
	currencies?: Record<string, { amount: number }>;
} = {}) =>
	({
		id: "pr_base",
		is_custom: false,
		entitlement_id: null,
		proration_config: null,
		billing_type: null,
		tier_behavior: null,
		config: {
			type: "fixed",
			amount,
			interval: "month",
			interval_count: 1,
			feature_id: null,
			internal_feature_id: null,
			base_currency: "usd",
			...(currencies ? { currencies } : {}),
		},
	}) as never;

const baseProduct = ({
	entitlements,
	freeTrial = null,
	prices = [],
}: {
	entitlements: unknown[];
	freeTrial?: unknown;
	prices?: unknown[];
}) =>
	({
		id: "pro",
		internal_id: "prod_internal_pro",
		name: "Pro",
		version: 3,
		is_add_on: false,
		is_default: false,
		prices,
		entitlements,
		free_trial: freeTrial,
	}) as unknown as FullProduct;

const customerProduct = ({
	entitlements,
	freeTrial = null,
	name = "Pro",
	prices = [],
}: {
	entitlements: unknown[];
	freeTrial?: unknown;
	name?: string;
	prices?: unknown[];
}) =>
	({
		id: "cus_prod_1",
		internal_product_id: "prod_internal_pro",
		product: {
			id: "pro",
			internal_id: "prod_internal_pro",
			name,
			version: 3,
			is_add_on: false,
			is_default: false,
		},
		customer_prices: prices.map((price) => ({ price })),
		customer_entitlements: entitlements.map((entitlement) => ({ entitlement })),
		free_trial: freeTrial,
		customer_licenses: [],
	}) as unknown as FullCusProduct;

const derive = ({
	customer,
	base,
	currency = "usd",
}: {
	customer: FullCusProduct;
	base?: FullProduct | null;
	currency?: string;
}) =>
	deriveCustomerProductIsCustom({
		customerProduct: customer,
		baseProduct: base,
		features: [{ id: "seats", type: FeatureType.Metered }] as never,
		currency,
		orgDefaultCurrency: "usd",
	});

describe("deriveCustomerProductIsCustom", () => {
	test("matches the catalog plan → not custom", () => {
		expect(
			derive({
				customer: customerProduct({ entitlements: [seatsEntitlement()] }),
				base: baseProduct({ entitlements: [seatsEntitlement()] }),
			}),
		).toBe(false);
	});

	test("different included usage → custom", () => {
		expect(
			derive({
				customer: customerProduct({
					entitlements: [seatsEntitlement({ allowance: 50 })],
				}),
				base: baseProduct({
					entitlements: [seatsEntitlement({ allowance: 5 })],
				}),
			}),
		).toBe(true);
	});

	test("different rollover config → custom", () => {
		expect(
			derive({
				customer: customerProduct({
					entitlements: [
						seatsEntitlement({
							rollover: { max: 100, duration: "month", length: 1 },
						}),
					],
				}),
				base: baseProduct({ entitlements: [seatsEntitlement()] }),
			}),
		).toBe(true);
	});

	test("extra entitlement on the customer → custom", () => {
		expect(
			derive({
				customer: customerProduct({
					entitlements: [
						seatsEntitlement(),
						seatsEntitlement({ id: "ent_extra" }),
					],
				}),
				base: baseProduct({ entitlements: [seatsEntitlement()] }),
			}),
		).toBe(true);
	});

	test("entitlement removed from the customer → custom", () => {
		expect(
			derive({
				customer: customerProduct({ entitlements: [] }),
				base: baseProduct({ entitlements: [seatsEntitlement()] }),
			}),
		).toBe(true);
	});

	// Deliberately excluded dimensions — these must NOT flip the flag.

	test("longer free trial with identical items → not custom", () => {
		expect(
			derive({
				customer: customerProduct({
					entitlements: [seatsEntitlement()],
					freeTrial: { length: 60, duration: "day", unique_fingerprint: false },
				}),
				base: baseProduct({
					entitlements: [seatsEntitlement()],
					freeTrial: { length: 14, duration: "day", unique_fingerprint: false },
				}),
			}),
		).toBe(false);
	});

	test("product-level details differing with identical items → not custom", () => {
		expect(
			derive({
				customer: customerProduct({
					entitlements: [seatsEntitlement()],
					name: "Pro (renamed)",
				}),
				base: baseProduct({ entitlements: [seatsEntitlement()] }),
			}),
		).toBe(false);
	});

	// Currency projection — the comparison runs in the customer's own currency,
	// so a plan's other currencies are a purchase-time option, not a divergence.

	test("plan gains a currency the customer is not on → not custom", () => {
		expect(
			derive({
				currency: "usd",
				customer: customerProduct({
					entitlements: [seatsEntitlement()],
					prices: [basePrice()],
				}),
				base: baseProduct({
					entitlements: [seatsEntitlement()],
					prices: [basePrice({ currencies: { gbp: { amount: 6 } } })],
				}),
			}),
		).toBe(false);
	});

	test("plan edits the currency the customer IS on → custom", () => {
		expect(
			derive({
				currency: "usd",
				customer: customerProduct({
					entitlements: [seatsEntitlement()],
					prices: [basePrice({ amount: 8 })],
				}),
				base: baseProduct({
					entitlements: [seatsEntitlement()],
					prices: [basePrice({ amount: 10 })],
				}),
			}),
		).toBe(true);
	});

	test("plan edits a currency the customer is not on → not custom", () => {
		expect(
			derive({
				currency: "usd",
				customer: customerProduct({
					entitlements: [seatsEntitlement()],
					prices: [basePrice({ currencies: { gbp: { amount: 6 } } })],
				}),
				base: baseProduct({
					entitlements: [seatsEntitlement()],
					prices: [basePrice({ currencies: { gbp: { amount: 7 } } })],
				}),
			}),
		).toBe(false);
	});

	test("customer on a non-base currency, that currency edited → custom", () => {
		expect(
			derive({
				currency: "gbp",
				customer: customerProduct({
					entitlements: [seatsEntitlement()],
					prices: [basePrice({ currencies: { gbp: { amount: 6 } } })],
				}),
				base: baseProduct({
					entitlements: [seatsEntitlement()],
					prices: [basePrice({ currencies: { gbp: { amount: 7 } } })],
				}),
			}),
		).toBe(true);
	});

	test("plan drops the currency the customer is on → custom", () => {
		expect(
			derive({
				currency: "gbp",
				customer: customerProduct({
					entitlements: [seatsEntitlement()],
					prices: [basePrice({ currencies: { gbp: { amount: 6 } } })],
				}),
				base: baseProduct({
					entitlements: [seatsEntitlement()],
					prices: [basePrice()],
				}),
			}),
		).toBe(true);
	});

	// Conservative fallbacks — uncertainty resolves to custom.

	test("unresolvable base product → custom", () => {
		expect(
			derive({
				customer: customerProduct({ entitlements: [seatsEntitlement()] }),
				base: null,
			}),
		).toBe(true);
	});

	test("comparison throwing → custom", () => {
		const malformed = {
			get product() {
				throw new Error("unreadable customer product");
			},
		} as unknown as FullCusProduct;

		expect(
			derive({
				customer: malformed,
				base: baseProduct({ entitlements: [seatsEntitlement()] }),
			}),
		).toBe(true);
	});
});
