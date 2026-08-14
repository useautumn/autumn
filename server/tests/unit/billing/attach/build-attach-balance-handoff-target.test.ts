import { describe, expect, test } from "bun:test";
import {
	type AutumnBillingPlan,
	type FullCusProduct,
	type NormalizedFullSubject,
	SubjectType,
} from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildAttachBalanceHandoffTarget } from "@/internal/billing/v2/execute/attachBalanceHandoff/buildAttachBalanceHandoffTarget.js";

const normalized = ({
	customerEntitlements: subjectBalances = [],
	customerProducts: subjectCustomerProducts = [],
}: {
	customerEntitlements?: NormalizedFullSubject["customer_entitlements"];
	customerProducts?: FullCusProduct[];
} = {}): NormalizedFullSubject => {
	const customer = customers.create({});
	return {
		subjectType: SubjectType.Customer,
		customerId: customer.id || customer.internal_id,
		internalCustomerId: customer.internal_id,
		customer,
		customer_products:
			subjectCustomerProducts as unknown as NormalizedFullSubject["customer_products"],
		customer_entitlements: subjectBalances,
		customer_prices: [],
		customer_licenses: [],
		usage_windows: [],
		flags: {},
		products: subjectCustomerProducts.map(
			(customerProduct) => customerProduct.product,
		) as NormalizedFullSubject["products"],
		entitlements: [],
		prices: [],
		free_trials: [],
		subscriptions: [],
		invoices: [],
	};
};

const targetCustomerProduct = customerProducts.create({
	id: "target_customer_product",
	productId: "target",
});
const sourceCustomerProduct = customerProducts.create({
	id: "source_customer_product",
	productId: "source",
});

const plan = ({
	sourceCustomerProductId = sourceCustomerProduct.id,
	includePlannedTarget = true,
}: {
	sourceCustomerProductId?: string;
	includePlannedTarget?: boolean;
}): AutumnBillingPlan =>
	({
		customerId: "cus_test",
		insertCustomerProducts: includePlannedTarget ? [targetCustomerProduct] : [],
		attachBalanceHandoff: {
			sourceCustomerProductId,
			targetCustomerProductId: targetCustomerProduct.id,
		},
	}) as AutumnBillingPlan;

const build = ({
	autumnBillingPlan = plan({}),
	runtimeNormalized = normalized({
		customerProducts: [sourceCustomerProduct],
	}),
	postgresNormalized = normalized({
		customerProducts: [targetCustomerProduct],
	}),
}: {
	autumnBillingPlan?: AutumnBillingPlan;
	runtimeNormalized?: NormalizedFullSubject;
	postgresNormalized?: NormalizedFullSubject;
}) =>
	buildAttachBalanceHandoffTarget({
		ctx: {} as AutumnContext,
		autumnBillingPlan,
		runtimeNormalized,
		postgresNormalized,
	});

describe("buildAttachBalanceHandoffTarget identities", () => {
	test("copies Redis adjustment and additional balance into the target", () => {
		const postgresBalance = customerEntitlements.create({
			id: "shared_balance",
			featureId: "messages",
			featureName: "Messages",
			allowance: 100,
			balance: 100,
		});
		postgresBalance.customer_product_id = null;
		postgresBalance.next_reset_at = 2_000;
		postgresBalance.entities = {
			entity: { id: "entity", balance: 100, adjustment: 0 },
		};
		const runtimeBalance = structuredClone(postgresBalance);
		Object.assign(runtimeBalance, {
			balance: 95,
			adjustment: 4,
			additional_balance: 2,
			entities: {
				entity: {
					id: "entity",
					balance: 90,
					adjustment: 3,
					additional_balance: 1,
				},
			},
		});

		const result = build({
			runtimeNormalized: normalized({
				customerEntitlements: [runtimeBalance as never],
				customerProducts: [sourceCustomerProduct],
			}),
			postgresNormalized: normalized({
				customerEntitlements: [postgresBalance as never],
				customerProducts: [targetCustomerProduct],
			}),
		});

		expect(result.customer_entitlements[0]).toMatchObject({
			balance: 95,
			adjustment: 4,
			additional_balance: 2,
			next_reset_at: 2_000,
			entities: {
				entity: {
					balance: 90,
					adjustment: 3,
					additional_balance: 1,
				},
			},
		});
	});

	test("fails when the recorded source product is absent from the live snapshot", () => {
		expect(() =>
			build({
				autumnBillingPlan: plan({
					sourceCustomerProductId: "missing_source",
				}),
			}),
		).toThrow("missing_source");
	});

	test("fails when the recorded target product is absent after persistence", () => {
		expect(() =>
			build({
				autumnBillingPlan: plan({}),
				postgresNormalized: normalized(),
			}),
		).toThrow("target_customer_product");
	});

	test("fails when the recorded target product is absent from the saved plan", () => {
		expect(() =>
			build({
				autumnBillingPlan: plan({ includePlannedTarget: false }),
			}),
		).toThrow("target_customer_product");
	});
});
