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
	updateCustomerProducts = [],
	insertCustomerProducts = [],
}: {
	updateCustomerProduct?: {
		customerProduct: ReturnType<typeof customerProducts.create>;
		updates: Record<string, unknown>;
	};
	updateCustomerProducts?: {
		customerProduct: ReturnType<typeof customerProducts.create>;
		updates: Record<string, unknown>;
	}[];
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
			updateCustomerProducts,
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

	test("matches each inserted product to its own expired counterpart", async () => {
		const calls = await runPlan({
			updateCustomerProducts: [
				{
					customerProduct: customerProducts.create({
						id: "cus_prod_expired_1",
						productId: "prod_old_1",
						customerPrices: [
							prices.createCustomer({
								customerProductId: "cus_prod_expired_1",
								price: {
									...prices.createFixed({ id: "price_old_1" }),
									config: {
										...prices.createFixed({ id: "price_old_1" }).config,
										amount: 100,
									},
								},
							}),
						],
					}),
					updates: { status: CusProductStatus.Expired },
				},
				{
					customerProduct: customerProducts.create({
						id: "cus_prod_expired_2",
						productId: "prod_old_2",
						customerPrices: [
							prices.createCustomer({
								customerProductId: "cus_prod_expired_2",
								price: {
									...prices.createFixed({ id: "price_old_2" }),
									config: {
										...prices.createFixed({ id: "price_old_2" }).config,
										amount: 300,
									},
								},
							}),
						],
					}),
					updates: { status: CusProductStatus.Expired },
				},
			],
			insertCustomerProducts: [
				customerProducts.create({
					id: "cus_prod_new_1",
					productId: "prod_new_1",
					customerPrices: [
						prices.createCustomer({
							customerProductId: "cus_prod_new_1",
							price: {
								...prices.createFixed({ id: "price_new_1" }),
								config: {
									...prices.createFixed({ id: "price_new_1" }).config,
									amount: 200,
								},
							},
						}),
					],
				}),
				customerProducts.create({
					id: "cus_prod_new_2",
					productId: "prod_new_2",
					customerPrices: [
						prices.createCustomer({
							customerProductId: "cus_prod_new_2",
							price: {
								...prices.createFixed({ id: "price_new_2" }),
								config: {
									...prices.createFixed({ id: "price_new_2" }).config,
									amount: 100,
								},
							},
						}),
					],
				}),
			],
		});

		expect(calls).toHaveLength(2);
		expect(calls[0]?.customerProductId).toBe("cus_prod_new_1");
		expect(calls[0]?.scenario).toBe(AttachScenario.Upgrade);
		expect(calls[1]?.customerProductId).toBe("cus_prod_new_2");
		expect(calls[1]?.scenario).toBe(AttachScenario.New);
	});
});
