import { describe, expect, test } from "bun:test";
import {
	BillWhen,
	cusEntToEffectiveRolloverMax,
	type Entitlement,
	type FeatureOptions,
	type FullCustomerPrice,
	type Price,
	type RolloverConfig,
	RolloverExpiryDurationType,
	type RolloverMaxCustomerEntitlement,
} from "@autumn/shared";
import { entitlements } from "@tests/utils/fixtures/db/entitlements";
import { prices } from "@tests/utils/fixtures/db/prices";

const CUSTOMER_PRODUCT_ID = "cus_prod_1";
const ENTITLEMENT_ID = "ent_1";

const rolloverConfig = (
	overrides: Partial<RolloverConfig> = {},
): RolloverConfig => ({
	max: null,
	max_percentage: null,
	duration: RolloverExpiryDurationType.Month,
	length: 1,
	...overrides,
});

const makeEntitlement = ({
	allowance = 100,
	rollover = rolloverConfig(),
}: {
	allowance?: number;
	rollover?: RolloverConfig | null;
} = {}): Entitlement =>
	entitlements.build({ id: ENTITLEMENT_ID, allowance, rollover });

const prepaidPrice = ({
	billingUnits = 100,
	billWhen = BillWhen.InAdvance,
}: {
	billingUnits?: number;
	billWhen?: BillWhen;
} = {}): Price =>
	prices.buildUsage({
		overrides: { entitlement_id: ENTITLEMENT_ID },
		configOverrides: { bill_when: billWhen, billing_units: billingUnits },
	});

const customerPrice = (price: Price): FullCustomerPrice => ({
	...prices.createCustomer({ price, customerProductId: CUSTOMER_PRODUCT_ID }),
	created_at: 1_800_000_000_000,
});

const makeCustomerEntitlement = ({
	entitlement = makeEntitlement(),
	options = [],
	quantity = 1,
	customerPrices,
	pooledGranted,
	looseRow = false,
}: {
	entitlement?: Entitlement;
	options?: FeatureOptions[];
	quantity?: number;
	customerPrices?: FullCustomerPrice[];
	pooledGranted?: number;
	looseRow?: boolean;
} = {}): RolloverMaxCustomerEntitlement => ({
	id: "cus_ent_1",
	customer_product_id: looseRow ? null : CUSTOMER_PRODUCT_ID,
	entitlement,
	pooled_balance:
		pooledGranted == null ? null : { granted: pooledGranted, unlimited: false },
	customer_product: looseRow
		? null
		: {
				options,
				quantity,
				...(customerPrices ? { customer_prices: customerPrices } : {}),
			},
});

describe("cusEntToEffectiveRolloverMax: absolute max", () => {
	test("no rollover config returns null", () => {
		const max = cusEntToEffectiveRolloverMax({
			cusEnt: makeCustomerEntitlement({
				entitlement: makeEntitlement({ rollover: null }),
			}),
		});

		expect(max).toBeNull();
	});

	test("max_percentage null returns max", () => {
		const max = cusEntToEffectiveRolloverMax({
			cusEnt: makeCustomerEntitlement({
				entitlement: makeEntitlement({
					rollover: rolloverConfig({ max: 250, max_percentage: null }),
				}),
			}),
		});

		expect(max).toBe(250);
	});

	test("max_percentage undefined returns max", () => {
		const { max_percentage: _omitted, ...withoutPercentage } = rolloverConfig({
			max: 75,
		});
		const max = cusEntToEffectiveRolloverMax({
			cusEnt: makeCustomerEntitlement({
				entitlement: makeEntitlement({ rollover: withoutPercentage }),
			}),
		});

		expect(max).toBe(75);
	});

	test("max null and no percentage returns null (unlimited)", () => {
		const max = cusEntToEffectiveRolloverMax({
			cusEnt: makeCustomerEntitlement({
				entitlement: makeEntitlement({
					rollover: rolloverConfig({ max: null }),
				}),
			}),
		});

		expect(max).toBeNull();
	});

	test("max undefined and no percentage returns null (unlimited)", () => {
		const { max: _omitted, ...withoutMax } = rolloverConfig();
		const max = cusEntToEffectiveRolloverMax({
			cusEnt: makeCustomerEntitlement({
				entitlement: makeEntitlement({ rollover: withoutMax }),
			}),
		});

		expect(max).toBeNull();
	});

	test("max 0 is a real cap of 0, not unlimited", () => {
		const max = cusEntToEffectiveRolloverMax({
			cusEnt: makeCustomerEntitlement({
				entitlement: makeEntitlement({ rollover: rolloverConfig({ max: 0 }) }),
			}),
		});

		expect(max).toBe(0);
	});

	test("absolute max ignores allowance, quantity and pool", () => {
		const max = cusEntToEffectiveRolloverMax({
			cusEnt: makeCustomerEntitlement({
				entitlement: makeEntitlement({
					allowance: 10_000,
					rollover: rolloverConfig({ max: 40 }),
				}),
				quantity: 5,
				pooledGranted: 1_000_000,
			}),
		});

		expect(max).toBe(40);
	});
});

describe("cusEntToEffectiveRolloverMax: max_percentage on a fixed allowance", () => {
	test("percentage of the allowance when the product carries prices", () => {
		const max = cusEntToEffectiveRolloverMax({
			cusEnt: makeCustomerEntitlement({
				entitlement: makeEntitlement({
					allowance: 1000,
					rollover: rolloverConfig({ max_percentage: 25 }),
				}),
				customerPrices: [customerPrice(prices.buildFixed())],
			}),
		});

		expect(max).toBe(250);
	});

	test("percentage wins over max when both are set", () => {
		const max = cusEntToEffectiveRolloverMax({
			cusEnt: makeCustomerEntitlement({
				entitlement: makeEntitlement({
					allowance: 1000,
					rollover: rolloverConfig({ max: 5, max_percentage: 50 }),
				}),
				customerPrices: [],
			}),
		});

		expect(max).toBe(500);
	});

	test("floors fractional results", () => {
		const max = cusEntToEffectiveRolloverMax({
			cusEnt: makeCustomerEntitlement({
				entitlement: makeEntitlement({
					allowance: 25,
					rollover: rolloverConfig({ max_percentage: 50 }),
				}),
				customerPrices: [],
			}),
		});

		expect(max).toBe(12);
	});

	test("fractional percentage floors after the multiply", () => {
		const max = cusEntToEffectiveRolloverMax({
			cusEnt: makeCustomerEntitlement({
				entitlement: makeEntitlement({
					allowance: 100,
					rollover: rolloverConfig({ max_percentage: 12.5 }),
				}),
				customerPrices: [],
			}),
		});

		expect(max).toBe(12);
	});

	test("max_percentage 0 caps at 0", () => {
		const max = cusEntToEffectiveRolloverMax({
			cusEnt: makeCustomerEntitlement({
				entitlement: makeEntitlement({
					allowance: 100,
					rollover: rolloverConfig({ max_percentage: 0 }),
				}),
				customerPrices: [],
			}),
		});

		expect(max).toBe(0);
	});

	test("max_percentage above 100 allows more than one cycle's grant", () => {
		const max = cusEntToEffectiveRolloverMax({
			cusEnt: makeCustomerEntitlement({
				entitlement: makeEntitlement({
					allowance: 100,
					rollover: rolloverConfig({ max_percentage: 150 }),
				}),
				customerPrices: [],
			}),
		});

		expect(max).toBe(150);
	});

	test("product quantity multiplies the allowance (product with prices)", () => {
		const max = cusEntToEffectiveRolloverMax({
			cusEnt: makeCustomerEntitlement({
				entitlement: makeEntitlement({
					allowance: 100,
					rollover: rolloverConfig({ max_percentage: 50 }),
				}),
				quantity: 3,
				customerPrices: [customerPrice(prices.buildFixed())],
			}),
		});

		expect(max).toBe(150);
	});

	test("product quantity multiplies the allowance (product without prices)", () => {
		const max = cusEntToEffectiveRolloverMax({
			cusEnt: makeCustomerEntitlement({
				entitlement: makeEntitlement({
					allowance: 100,
					rollover: rolloverConfig({ max_percentage: 50 }),
				}),
				quantity: 3,
			}),
		});

		expect(max).toBe(150);
	});

	test("loose row (no customer product) uses the allowance once", () => {
		const max = cusEntToEffectiveRolloverMax({
			cusEnt: makeCustomerEntitlement({
				entitlement: makeEntitlement({
					allowance: 80,
					rollover: rolloverConfig({ max_percentage: 50 }),
				}),
				looseRow: true,
			}),
		});

		expect(max).toBe(40);
	});

	test("an arrear usage price leaves the base allowance as the starting balance", () => {
		const max = cusEntToEffectiveRolloverMax({
			cusEnt: makeCustomerEntitlement({
				entitlement: makeEntitlement({
					allowance: 200,
					rollover: rolloverConfig({ max_percentage: 50 }),
				}),
				quantity: 2,
				customerPrices: [
					customerPrice(prepaidPrice({ billWhen: BillWhen.EndOfPeriod })),
				],
			}),
		});

		// NOTE: current behavior; possible bug: a related price drops product quantity (100, not 200).
		expect(max).toBe(100);
	});
});

describe("cusEntToEffectiveRolloverMax: max_percentage on a prepaid row", () => {
	const prepaidEntitlement = (allowance = 0) =>
		makeEntitlement({
			allowance,
			rollover: rolloverConfig({ max_percentage: 50 }),
		});

	test("starting balance is purchased packs × billing units", () => {
		const max = cusEntToEffectiveRolloverMax({
			cusEnt: makeCustomerEntitlement({
				entitlement: prepaidEntitlement(),
				options: [{ feature_id: "messages", quantity: 3 }],
				customerPrices: [customerPrice(prepaidPrice({ billingUnits: 100 }))],
			}),
		});

		expect(max).toBe(150);
	});

	test("included allowance is added on top of the purchased quantity", () => {
		const max = cusEntToEffectiveRolloverMax({
			cusEnt: makeCustomerEntitlement({
				entitlement: prepaidEntitlement(50),
				options: [{ feature_id: "messages", quantity: 3 }],
				customerPrices: [customerPrice(prepaidPrice({ billingUnits: 100 }))],
			}),
		});

		expect(max).toBe(175);
	});

	test("options match by internal_feature_id when feature_id differs", () => {
		const max = cusEntToEffectiveRolloverMax({
			cusEnt: makeCustomerEntitlement({
				entitlement: prepaidEntitlement(),
				options: [
					{
						feature_id: "other_feature",
						internal_feature_id: "feat_internal_messages",
						quantity: 4,
					},
				],
				customerPrices: [customerPrice(prepaidPrice({ billingUnits: 10 }))],
			}),
		});

		expect(max).toBe(20);
	});

	test("start_of_period prepaid sizes the same way as in_advance", () => {
		const max = cusEntToEffectiveRolloverMax({
			cusEnt: makeCustomerEntitlement({
				entitlement: prepaidEntitlement(),
				options: [{ feature_id: "messages", quantity: 2 }],
				customerPrices: [
					customerPrice(
						prepaidPrice({
							billingUnits: 100,
							billWhen: BillWhen.StartOfPeriod,
						}),
					),
				],
			}),
		});

		expect(max).toBe(100);
	});

	// Parked 2026-09-22: at a reset the cap should follow the quantity the new cycle bills, i.e.
	// upcoming_quantity when set (cusEntToStartingBalance already has useUpcomingQuantity). Flip this
	// to a plain test once cusEntToEffectiveRolloverMax takes that option.
	test.failing(
		"a reset caps at upcoming_quantity when a quantity change is scheduled",
		() => {
			const max = cusEntToEffectiveRolloverMax({
				cusEnt: makeCustomerEntitlement({
					entitlement: prepaidEntitlement(),
					options: [
						{ feature_id: "messages", quantity: 3, upcoming_quantity: 1 },
					],
					customerPrices: [customerPrice(prepaidPrice({ billingUnits: 100 }))],
				}),
			});

			expect(max).toBe(50);
		},
	);

	test("product quantity does not multiply a prepaid starting balance", () => {
		const max = cusEntToEffectiveRolloverMax({
			cusEnt: makeCustomerEntitlement({
				entitlement: prepaidEntitlement(),
				options: [{ feature_id: "messages", quantity: 3 }],
				quantity: 4,
				customerPrices: [customerPrice(prepaidPrice({ billingUnits: 100 }))],
			}),
		});

		expect(max).toBe(150);
	});

	test("no matching options falls back to the allowance", () => {
		const max = cusEntToEffectiveRolloverMax({
			cusEnt: makeCustomerEntitlement({
				entitlement: prepaidEntitlement(40),
				options: [{ feature_id: "other_feature", quantity: 9 }],
				customerPrices: [customerPrice(prepaidPrice({ billingUnits: 100 }))],
			}),
		});

		expect(max).toBe(20);
	});

	test("a price for a different customer product is not used", () => {
		const foreignPrice: FullCustomerPrice = {
			...customerPrice(prepaidPrice({ billingUnits: 100 })),
			customer_product_id: "cus_prod_other",
		};
		const max = cusEntToEffectiveRolloverMax({
			cusEnt: makeCustomerEntitlement({
				entitlement: prepaidEntitlement(40),
				options: [{ feature_id: "messages", quantity: 3 }],
				customerPrices: [foreignPrice],
			}),
		});

		expect(max).toBe(20);
	});

	test("prepaid product without customer_prices ignores the purchased quantity", () => {
		const max = cusEntToEffectiveRolloverMax({
			cusEnt: makeCustomerEntitlement({
				entitlement: prepaidEntitlement(0),
				options: [{ feature_id: "messages", quantity: 3 }],
			}),
		});

		// NOTE: current behavior; possible bug: without prices the purchased 300 is invisible, cap is 0.
		expect(max).toBe(0);
	});
});

describe("cusEntToEffectiveRolloverMax: pooled row", () => {
	test("percentage of the pool's granted balance", () => {
		const max = cusEntToEffectiveRolloverMax({
			cusEnt: makeCustomerEntitlement({
				entitlement: makeEntitlement({
					allowance: 100,
					rollover: rolloverConfig({ max_percentage: 10 }),
				}),
				pooledGranted: 4_321,
				customerPrices: [customerPrice(prepaidPrice({ billingUnits: 100 }))],
				options: [{ feature_id: "messages", quantity: 3 }],
			}),
		});

		expect(max).toBe(432);
	});

	test("pool wins even when the product has no prices", () => {
		const max = cusEntToEffectiveRolloverMax({
			cusEnt: makeCustomerEntitlement({
				entitlement: makeEntitlement({
					allowance: 100,
					rollover: rolloverConfig({ max_percentage: 50 }),
				}),
				pooledGranted: 900,
				quantity: 7,
			}),
		});

		expect(max).toBe(450);
	});

	test("a pool with nothing granted caps at 0", () => {
		const max = cusEntToEffectiveRolloverMax({
			cusEnt: makeCustomerEntitlement({
				entitlement: makeEntitlement({
					allowance: 100,
					rollover: rolloverConfig({ max_percentage: 50 }),
				}),
				pooledGranted: 0,
			}),
		});

		expect(max).toBe(0);
	});
});
