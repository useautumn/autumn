import { expect, test } from "bun:test";
import { CusProductStatus, type UsagePriceConfig } from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import { prices } from "@tests/utils/fixtures/db/prices.js";
import { selectThresholdBlockedProducts } from "@/internal/balances/thresholdBilling/selectThresholdBlockedProducts.js";

const plan = ({
	id,
	status = CusProductStatus.PastDue,
	thresholdBilled = true,
}: {
	id: string;
	status?: CusProductStatus;
	thresholdBilled?: boolean;
}) => {
	const entitlement = customerEntitlements.create({
		id: `balance_${id}`,
		entitlementId: `ent_${id}`,
		customerProductId: id,
		featureId: "messages",
		featureName: "Messages",
		allowance: 0,
		balance: -140,
	});
	const price = prices.buildUsage({
		overrides: {
			id: `price_${id}`,
			entitlement_id: entitlement.entitlement_id,
		},
		configOverrides: (thresholdBilled
			? { threshold_billing: { threshold: 100 } }
			: {}) as Partial<UsagePriceConfig>,
	});
	return customerProducts.create({
		id,
		productId: id,
		status,
		customerEntitlements: [entitlement],
		customerPrices: [prices.createCustomer({ price, customerProductId: id })],
	});
};

const idsOf = (products: { id: string }[]) => products.map(({ id }) => id);

test("a paid invoice clears only the plan it names", () => {
	const fullCustomer = customers.create({
		customerProducts: [plan({ id: "plan_a" }), plan({ id: "plan_b" })],
	});

	expect(
		idsOf(
			selectThresholdBlockedProducts({
				fullCustomer,
				customerProductId: "plan_a",
			}),
		),
	).toEqual(["plan_a"]);
});

test("an invoice naming no plan clears every blocked plan", () => {
	const fullCustomer = customers.create({
		customerProducts: [plan({ id: "plan_a" }), plan({ id: "plan_b" })],
	});

	expect(idsOf(selectThresholdBlockedProducts({ fullCustomer }))).toEqual([
		"plan_a",
		"plan_b",
	]);
});

test("active and non-threshold plans are never cleared", () => {
	const fullCustomer = customers.create({
		customerProducts: [
			plan({ id: "active_plan", status: CusProductStatus.Active }),
			plan({ id: "no_threshold", thresholdBilled: false }),
			plan({ id: "blocked" }),
		],
	});

	expect(idsOf(selectThresholdBlockedProducts({ fullCustomer }))).toEqual([
		"blocked",
	]);
});
