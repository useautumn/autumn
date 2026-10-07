import { describe, expect, mock, test } from "bun:test";
import type { FullCusProduct, FullProduct } from "@autumn/shared";
import {
	AllowanceType,
	EntInterval,
	FeatureType,
	ProcessorType,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { deriveCustomerProductIsCustom } from "@/internal/billing/v2/execute/deriveCustomerProductIsCustom";

/**
 * `is_custom` is derived by diffing a customer product's own plan against the
 * catalog version it points at, via `diffPlanV1`.
 *
 * The false-negative cases matter most: a customer product wrongly read as
 * non-custom is swept into version migrations, which overwrite the very rows
 * that made it custom. False positives only mean the customer is skipped.
 */

const seatsFeature = {
	id: "seats",
	name: "Seats",
	type: FeatureType.Metered,
	config: { usage_type: "single_use" },
	internal_id: "fe_seats",
} as never;

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
		internal_feature_id: "fe_seats",
		feature_id: "seats",
		feature: seatsFeature,
		allowance,
		allowance_type: AllowanceType.Fixed,
		interval: EntInterval.Month,
		interval_count: 1,
		entity_feature_id: null,
		pooled: false,
		carry_from_previous: false,
		usage_limit: null,
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
		created_at: 1,
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

/** A link granting `included` seats of another plan. */
const planLicense = ({
	included = 2,
	licensePlanId = "seat_plan",
}: {
	included?: number;
	licensePlanId?: string;
} = {}) =>
	({
		id: `plan_lic_${licensePlanId}`,
		included,
		prepaid_only: true,
		is_custom: false,
		customized: false,
		parent_internal_product_id: "prod_internal_pro",
		license_internal_product_id: `prod_internal_${licensePlanId}`,
		metadata: {},
		created_at: 1,
		updated_at: 1,
		product: {
			id: licensePlanId,
			internal_id: `prod_internal_${licensePlanId}`,
			name: "Seat plan",
			version: 1,
			env: "sandbox",
			created_at: 1,
			archived: false,
			is_add_on: false,
			is_default: false,
			group: "",
			description: null,
			config: { ignore_past_due: false },
			metadata: {},
			prices: [],
			entitlements: [],
			free_trial: null,
		},
	}) as never;

const productShape = ({ name = "Pro" }: { name?: string } = {}) => ({
	id: "pro",
	internal_id: "prod_internal_pro",
	name,
	version: 3,
	env: "sandbox",
	created_at: 1,
	archived: false,
	is_add_on: false,
	is_default: false,
	group: "",
	description: null,
	config: { ignore_past_due: false },
	metadata: {},
});

const baseProduct = ({
	entitlements,
	freeTrial = null,
	prices = [],
	licenses = [],
}: {
	entitlements: unknown[];
	freeTrial?: unknown;
	prices?: unknown[];
	licenses?: unknown[];
}) =>
	({
		...productShape(),
		prices,
		entitlements,
		free_trial: freeTrial,
		licenses,
	}) as unknown as FullProduct;

const customerProduct = ({
	entitlements,
	freeTrial = null,
	name = "Pro",
	prices = [],
	licenses = [],
	processorType,
}: {
	entitlements: unknown[];
	freeTrial?: unknown;
	name?: string;
	prices?: unknown[];
	licenses?: unknown[];
	processorType?: ProcessorType;
}) =>
	({
		id: "cus_prod_1",
		...(processorType ? { processor: { type: processorType } } : {}),
		internal_product_id: "prod_internal_pro",
		product: productShape({ name }),
		customer_prices: prices.map((price) => ({ price })),
		customer_entitlements: entitlements.map((entitlement) => ({ entitlement })),
		free_trial: freeTrial,
		customer_licenses: licenses.map((planLicenseRow) => ({
			planLicense: planLicenseRow,
		})),
	}) as unknown as FullCusProduct;

const fakeLogger = ({
	onError = () => {},
}: {
	onError?: (...args: unknown[]) => void;
} = {}) => {
	const logger = {
		warn: mock(() => {}),
		error: mock(onError),
		child: mock(() => logger),
	};
	return logger;
};

const derive = ({
	customer,
	base,
	logger = fakeLogger(),
}: {
	customer: FullCusProduct;
	base?: FullProduct | null;
	logger?: ReturnType<typeof fakeLogger>;
}) =>
	deriveCustomerProductIsCustom({
		ctx: { logger } as unknown as Pick<AutumnContext, "logger">,
		customerProduct: customer,
		baseProduct: base,
		features: [seatsFeature],
	});

describe("deriveCustomerProductIsCustom", () => {
	test("matches the catalog plan → not custom", () => {
		expect(
			derive({
				customer: customerProduct({
					entitlements: [seatsEntitlement()],
					prices: [basePrice()],
				}),
				base: baseProduct({
					entitlements: [seatsEntitlement()],
					prices: [basePrice()],
				}),
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
						seatsEntitlement({ id: "ent_extra", allowance: 9 }),
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

	test("base price amount differs → custom", () => {
		expect(
			derive({
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

	// Licenses — the gap the old hand-rolled comparison left open.

	test("license included amount differs → custom", () => {
		expect(
			derive({
				customer: customerProduct({
					entitlements: [seatsEntitlement()],
					licenses: [planLicense({ included: 20 })],
				}),
				base: baseProduct({
					entitlements: [seatsEntitlement()],
					licenses: [planLicense({ included: 2 })],
				}),
			}),
		).toBe(true);
	});

	test("customer holds a license the plan does not → custom", () => {
		expect(
			derive({
				customer: customerProduct({
					entitlements: [seatsEntitlement()],
					licenses: [planLicense(), planLicense({ licensePlanId: "extra" })],
				}),
				base: baseProduct({
					entitlements: [seatsEntitlement()],
					licenses: [planLicense()],
				}),
			}),
		).toBe(true);
	});

	test("identical licenses → not custom", () => {
		expect(
			derive({
				customer: customerProduct({
					entitlements: [seatsEntitlement()],
					licenses: [planLicense()],
				}),
				base: baseProduct({
					entitlements: [seatsEntitlement()],
					licenses: [planLicense()],
				}),
			}),
		).toBe(false);
	});

	// Currency — a plan's other currencies are a purchase-time option for new
	// buyers, so gaining one must not mark the customers already on it custom.

	test("plan gains a currency the customer does not have → not custom", () => {
		expect(
			derive({
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

	test("a currency present on both sides changes amount → custom", () => {
		expect(
			derive({
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

	// Deliberately excluded — these must NOT flip the flag.

	test("longer free trial with identical items → not custom", () => {
		expect(
			derive({
				customer: customerProduct({
					entitlements: [seatsEntitlement()],
					freeTrial: {
						length: 60,
						duration: "day",
						unique_fingerprint: false,
						card_required: false,
					},
				}),
				base: baseProduct({
					entitlements: [seatsEntitlement()],
					freeTrial: {
						length: 14,
						duration: "day",
						unique_fingerprint: false,
						card_required: false,
					},
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

	// Conservative fallbacks — uncertainty resolves to custom.

	test("unresolvable base product → custom", () => {
		expect(
			derive({
				customer: customerProduct({ entitlements: [seatsEntitlement()] }),
				base: null,
			}),
		).toBe(true);
	});

	const malformedCustomerProduct = () =>
		({
			id: "cus_prod_malformed",
			internal_product_id: "prod_internal_malformed",
			get product() {
				throw new Error("unreadable customer product");
			},
		}) as unknown as FullCusProduct;

	test("comparison throwing → custom, reported with the product ids", () => {
		const logger = fakeLogger();

		expect(
			derive({
				customer: malformedCustomerProduct(),
				base: baseProduct({ entitlements: [seatsEntitlement()] }),
				logger,
			}),
		).toBe(true);

		expect(logger.child).toHaveBeenCalledWith({
			context: {
				customer_product_id: "cus_prod_malformed",
				internal_product_id: "prod_internal_malformed",
			},
		});
		expect(logger.error).toHaveBeenCalledTimes(1);
		const [message, fields] = logger.error.mock.calls[0] as unknown as [
			string,
			{ error: Error },
		];
		expect(message).toContain("unreadable customer product");
		expect(fields.error.message).toContain("cus_prod_malformed");
		expect(fields.error.message).toContain("prod_internal_malformed");
	});

	test("reporter throwing → still custom", () => {
		const logger = fakeLogger({
			onError: () => {
				throw new Error("sentry down");
			},
		});

		expect(
			derive({
				customer: malformedCustomerProduct(),
				base: baseProduct({ entitlements: [seatsEntitlement()] }),
				logger,
			}),
		).toBe(true);
		expect(logger.error).toHaveBeenCalledTimes(1);
	});

	// RevenueCat purchases arrive with no params and can't be customised.

	test("RevenueCat product diverging from the catalog → not custom", () => {
		expect(
			derive({
				customer: customerProduct({
					entitlements: [seatsEntitlement({ allowance: 50 })],
					prices: [basePrice({ amount: 20 })],
					processorType: ProcessorType.RevenueCat,
				}),
				base: baseProduct({
					entitlements: [seatsEntitlement({ allowance: 5 })],
					prices: [basePrice()],
				}),
			}),
		).toBe(false);
	});

	test("RevenueCat product with an unresolvable base product → not custom", () => {
		expect(
			derive({
				customer: customerProduct({
					entitlements: [seatsEntitlement()],
					processorType: ProcessorType.RevenueCat,
				}),
				base: null,
			}),
		).toBe(false);
	});

	test("Stripe product diverging from the catalog → custom", () => {
		expect(
			derive({
				customer: customerProduct({
					entitlements: [seatsEntitlement()],
					prices: [basePrice({ amount: 20 })],
					processorType: ProcessorType.Stripe,
				}),
				base: baseProduct({
					entitlements: [seatsEntitlement()],
					prices: [basePrice()],
				}),
			}),
		).toBe(true);
	});
});
