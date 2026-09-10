import { expect, test } from "bun:test";
import {
	BillingInterval,
	BillWhen,
	type AutoTopup,
	type UsagePriceConfig,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import { prices } from "@tests/utils/fixtures/db/prices.js";
import { computeAutoTopupPlan } from "@/internal/balances/autoTopUp/compute/computeAutoTopupPlan.js";
import { fullCustomerToAutoTopupObjects } from "@/internal/balances/autoTopUp/helpers/fullCustomerToAutoTopupObjects.js";
import type { AutoTopupContext } from "@/internal/balances/autoTopUp/autoTopupContext.js";

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
	test(`threshold selection: ${usage} feature units`, () => {
		const fullCustomer = customers.create({
			customerProducts: [createPlan({ balance: -usage })],
		});
		const result = fullCustomerToAutoTopupObjects({
			fullCustomer,
			featureId: "messages",
		});
		expect(result?.autoTopupConfig).toMatchObject({ quantity: 100 });
		expect(result?.balanceBelowThreshold).toBe(usage >= 100);
	});
}

test("threshold selection resolves the threshold item", () => {
	const fullCustomer = customers.create({ customerProducts: [createPlan()] });
	const result = fullCustomerToAutoTopupObjects({
		fullCustomer,
		featureId: "messages",
	});
	expect(result?.customerEntitlement.customer_product_id).toBe("threshold");
	expect(result?.balanceBelowThreshold).toBe(true);
});

test("disabled auto top-up never falls through to threshold billing", () => {
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

test("configured auto top-up cannot fall back to a threshold price", () => {
	const fullCustomer = customers.create({
		customerProducts: [
			createPlan({ config: { threshold_billing: undefined } }),
		],
	});
	fullCustomer.auto_topups = [autoTopup];
	expect(
		fullCustomerToAutoTopupObjects({ fullCustomer, featureId: "messages" }),
	).toBeNull();
});
