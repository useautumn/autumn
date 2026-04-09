import { afterEach, describe, expect, test } from "bun:test";
import { AttachScenario, CusProductStatus } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import chalk from "chalk";
import { billingPlanToSendProductsUpdated } from "@/internal/billing/v2/workflows/sendProductsUpdated/billingPlanToSendProductsUpdated";
import { type SendProductsUpdatedPayload, workflows } from "@/queue/workflows";

const originalTrigger = workflows.triggerSendProductsUpdated;

afterEach(() => {
	workflows.triggerSendProductsUpdated = originalTrigger;
});

const runPlan = async ({
	updateCustomerProduct,
	insertCustomerProducts = [],
}: {
	updateCustomerProduct?: {
		customerProduct: ReturnType<typeof customerProducts.create>;
		updates: Record<string, unknown>;
	};
	insertCustomerProducts?: ReturnType<typeof customerProducts.create>[];
}) => {
	const calls: SendProductsUpdatedPayload[] = [];

	workflows.triggerSendProductsUpdated = (async (payload) => {
		calls.push(payload);
	}) as typeof workflows.triggerSendProductsUpdated;

	await billingPlanToSendProductsUpdated({
		ctx: contexts.create({}),
		autumnBillingPlan: {
			customerId: "cus_test",
			insertCustomerProducts,
			customPrices: [],
			customEntitlements: [],
			updateCustomerProduct,
		},
		billingContext: contexts.createBilling({}),
	});

	return calls;
};

describe(chalk.yellowBright("billingPlanToSendProductsUpdated"), () => {
	test("queues cancel webhook", async () => {
		const calls = await runPlan({
			updateCustomerProduct: {
				customerProduct: customerProducts.create({}),
				updates: {
					canceled: true,
					canceled_at: Date.now(),
					ended_at: Date.now() + 1000,
				},
			},
		});

		expect(calls).toHaveLength(1);
		expect(calls[0]?.scenario).toBe(AttachScenario.Cancel);
		expect(calls[0]?.customerProductId).toBe("cus_prod_test");
	});

	test("queues renew webhook", async () => {
		const calls = await runPlan({
			updateCustomerProduct: {
				customerProduct: customerProducts.create({}),
				updates: {
					canceled: false,
					canceled_at: null,
					ended_at: null,
				},
			},
		});

		expect(calls).toHaveLength(1);
		expect(calls[0]?.scenario).toBe(AttachScenario.Renew);
	});

	test("queues update_prepaid_quantity webhook for options-only updates", async () => {
		const calls = await runPlan({
			updateCustomerProduct: {
				customerProduct: customerProducts.create({}),
				updates: {
					options: [{ feature_id: "messages", quantity: 200 }],
				},
			},
		});

		expect(calls).toHaveLength(1);
		expect(calls[0]?.scenario).toBe(AttachScenario.UpdatePrepaidQuantity);
	});

	test("queues downgrade when canceling into a paid scheduled product", async () => {
		const calls = await runPlan({
			updateCustomerProduct: {
				customerProduct: customerProducts.create({}),
				updates: {
					canceled: true,
					canceled_at: Date.now(),
					ended_at: Date.now() + 1000,
				},
			},
			insertCustomerProducts: [
				customerProducts.create({
					id: "cus_prod_scheduled",
					status: CusProductStatus.Scheduled,
					customerPrices: [
						prices.createCustomer({
							price: prices.createFixed({ id: "price_paid" }),
							customerProductId: "cus_prod_scheduled",
						}),
					],
					product: products.createFull({
						id: "prod_scheduled",
					}),
				}),
			],
		});

		expect(calls).toHaveLength(1);
		expect(calls[0]?.scenario).toBe(AttachScenario.Downgrade);
	});

	test("does not queue webhook for unrelated updates", async () => {
		const calls = await runPlan({
			updateCustomerProduct: {
				customerProduct: customerProducts.create({}),
				updates: { status: CusProductStatus.Active },
			},
		});

		expect(calls).toHaveLength(0);
	});
});
