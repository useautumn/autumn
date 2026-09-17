import { expect, test } from "bun:test";
import type { AutoTopup, UsagePriceConfig } from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import { prices } from "@tests/utils/fixtures/db/prices.js";
import { fullCustomerToAutoTopupObjects } from "@/internal/balances/autoTopUp/helpers/fullCustomerToAutoTopupObjects.js";
import { resolveThresholdSettlement } from "@/internal/balances/thresholdBilling/resolve/resolveThresholdSettlement.js";

const createPlan = ({
	id = "threshold",
	balance = -140,
	config = {},
}: {
	id?: string;
	balance?: number;
	config?: Partial<UsagePriceConfig>;
} = {}) => {
	const entitlement = customerEntitlements.create({
		id: `balance_${id}`,
		entitlementId: `ent_${id}`,
		customerProductId: id,
		featureId: "messages",
		featureName: "Messages",
		allowance: 0,
		balance,
	});
	const price = prices.buildUsage({
		overrides: {
			id: `price_${id}`,
			entitlement_id: entitlement.entitlement_id,
		},
		configOverrides: { threshold_billing: { threshold: 100 }, ...config },
	});
	return customerProducts.create({
		id,
		productId: id,
		customerEntitlements: [entitlement],
		customerPrices: [prices.createCustomer({ price, customerProductId: id })],
	});
};

const autoTopup: AutoTopup = {
	feature_id: "messages",
	enabled: true,
	threshold: 20,
	quantity: 500,
};

for (const usage of [99, 100, 140, 240]) {
	test(`settles one threshold chunk at ${usage} feature units`, () => {
		const fullCustomer = customers.create({
			customerProducts: [createPlan({ balance: -usage })],
		});
		const settlement = resolveThresholdSettlement({
			fullCustomer,
			featureId: "messages",
		});

		if (usage < 100) {
			expect(settlement.kind).toBe("nothing_to_settle");
			return;
		}

		expect(settlement).toMatchObject({
			kind: "settle",
			charge: { chargeUnits: 100, remainingUnits: usage - 100 },
		});
	});
}

test("settlement resolves the threshold item", () => {
	const fullCustomer = customers.create({ customerProducts: [createPlan()] });
	const settlement = resolveThresholdSettlement({
		fullCustomer,
		featureId: "messages",
	});
	expect(settlement).toMatchObject({
		kind: "settle",
		customerEntitlement: { customer_product_id: "threshold" },
	});
});

test("a plan without a threshold price is not threshold billed", () => {
	const fullCustomer = customers.create({
		customerProducts: [
			createPlan({ config: { threshold_billing: undefined } }),
		],
	});
	expect(
		resolveThresholdSettlement({ fullCustomer, featureId: "messages" }),
	).toEqual({ kind: "not_threshold_billed" });
});

test("a threshold price never synthesizes an auto top-up config", () => {
	const fullCustomer = customers.create({ customerProducts: [createPlan()] });
	expect(
		fullCustomerToAutoTopupObjects({ fullCustomer, featureId: "messages" }),
	).toBeNull();
});

test("a disabled auto top-up stays disabled", () => {
	const fullCustomer = customers.create({
		customerProducts: [
			createPlan({ config: { threshold_billing: undefined } }),
		],
	});
	fullCustomer.auto_topups = [{ ...autoTopup, enabled: false }];
	expect(
		fullCustomerToAutoTopupObjects({ fullCustomer, featureId: "messages" }),
	).toBeNull();
});
