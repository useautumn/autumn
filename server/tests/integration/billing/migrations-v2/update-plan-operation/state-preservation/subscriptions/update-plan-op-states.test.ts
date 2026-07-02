/**
 * TDD coverage for update_plan migrations preserving in-flight subscription
 * states.
 *
 * Contract under test:
 *   - Updating the active plan's base price does not clear a scheduled downgrade.
 *   - Updating a canceling plan's base price does not clear end-of-cycle cancel.
 *   - Entity-scoped and multi-product states survive a customer migration.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiEntityV0,
	CusProductStatus,
	customerPrices,
	customerProducts,
	customers,
	findActiveCustomerProductById,
	prices,
} from "@autumn/shared";
import {
	expectCustomerProducts,
	expectProductCanceling,
	expectProductNotPresent,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectCustomerProductStatuses } from "@tests/integration/billing/utils/expectCustomerProductStatuses";
import { expectNoExpiredCustomerProducts } from "@tests/integration/billing/utils/expectNoExpiredCustomerProducts";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq, isNull } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { runUpdatePlanMigration } from "../../../utils/runUpdatePlanMigration";

const getScheduledIds = async ({
	ctx,
	customerId,
	productId,
	entityId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customerId: string;
	productId: string;
	entityId?: string;
}) =>
	(
		await ctx.db
			.select({ scheduledIds: customerProducts.scheduled_ids })
			.from(customerProducts)
			.innerJoin(
				customers,
				eq(customerProducts.internal_customer_id, customers.internal_id),
			)
			.where(
				and(
					eq(customers.org_id, ctx.org.id),
					eq(customers.env, ctx.env),
					eq(customers.id, customerId),
					eq(customerProducts.product_id, productId),
					eq(customerProducts.status, CusProductStatus.Scheduled),
					entityId
						? eq(customerProducts.entity_id, entityId)
						: isNull(customerProducts.entity_id),
				),
			)
	)
		.flatMap((row) => row.scheduledIds ?? [])
		.sort();

const expectScheduledIdsPreservedOrRewired = async ({
	ctx,
	before,
	after,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	before: string[];
	after: string[];
}) => {
	expect(after.length).toBe(before.length);

	for (const scheduledId of after) {
		const schedule =
			await ctx.stripeCli.subscriptionSchedules.retrieve(scheduledId);
		expect(["active", "not_started"]).toContain(schedule.status);
	}

	const afterSet = new Set(after);
	for (const scheduledId of before) {
		if (afterSet.has(scheduledId)) {
			continue;
		}

		const schedule =
			await ctx.stripeCli.subscriptionSchedules.retrieve(scheduledId);
		expect(["released", "canceled"]).toContain(schedule.status);
	}
};

const getCustomerProductPriceAmounts = async ({
	ctx,
	customerId,
	productId,
	entityId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customerId: string;
	productId: string;
	entityId?: string;
}) =>
	(
		await ctx.db
			.select({ config: prices.config })
			.from(customerProducts)
			.innerJoin(
				customers,
				eq(customerProducts.internal_customer_id, customers.internal_id),
			)
			.innerJoin(
				customerPrices,
				eq(customerPrices.customer_product_id, customerProducts.id),
			)
			.innerJoin(prices, eq(customerPrices.price_id, prices.id))
			.where(
				and(
					eq(customers.org_id, ctx.org.id),
					eq(customers.env, ctx.env),
					eq(customers.id, customerId),
					eq(customerProducts.product_id, productId),
					entityId
						? eq(customerProducts.entity_id, entityId)
						: isNull(customerProducts.entity_id),
				),
			)
	)
		.map((row) =>
			row.config && "amount" in row.config ? row.config.amount : undefined,
		)
		.filter((amount): amount is number => typeof amount === "number")
		.sort((a, b) => a - b);

// Red: version update_plan replacement reset a past_due cusProduct to active.
// Green: the replacement inherits past_due while the old row expires.
test.concurrent(
	`${chalk.yellowBright("migrations update_plan states: past_due survives version update")}`,
	async () => {
		const customerId = "migration-update-state-past-due";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const fullCustomerBefore = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const cusProductBefore = findActiveCustomerProductById({
			fullCus: fullCustomerBefore,
			productId: pro.id,
		});
		expect(cusProductBefore).toBeDefined();

		await CusProductService.update({
			ctx,
			cusProductId: cusProductBefore!.id,
			updates: { status: CusProductStatus.PastDue },
		});

		const invoiceCountBefore =
			(await autumnV1.customers.get<ApiCustomerV3>(customerId)).invoices
				?.length ?? 0;

		await autumnV1.products.update(pro.id, {
			items: [
				items.monthlyPrice({ price: 20 }),
				items.monthlyMessages({ includedUsage: 600 }),
			],
		});

		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${customerId}-mig`,
			customerId,
			runOnServer: false,
			filter: { customer: { plan: { plan_id: pro.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: pro.id },
						version: 2,
					},
				],
			},
		});

		const customerAfter =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer: customerAfter,
			pastDue: [pro.id],
		});

		const { byStatus } = await expectCustomerProductStatuses({
			ctx,
			customerId,
			productId: pro.id,
			expected: {
				[CusProductStatus.PastDue]: 1,
				[CusProductStatus.Expired]: 1,
			},
		});

		expect(byStatus[CusProductStatus.PastDue]?.[0]?.product.version).toBe(2);
		expect(customerAfter.invoices?.length ?? 0).toBe(invoiceCountBefore);
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("migrations update_plan states: scheduled downgrade survives active plan price update")}`,
	async () => {
		const customerId = "migration-update-state-downgrade";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: premium.id }),
				s.billing.attach({ productId: pro.id }),
			],
		});

		const before = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({ customer: before, productId: premium.id });
		await expectProductScheduled({ customer: before, productId: pro.id });
		const scheduledIdsBefore = await getScheduledIds({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(scheduledIdsBefore.length).toBeGreaterThan(0);

		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${customerId}-mig`,
			customerId,
			runOnServer: false,
			filter: { customer: { plan: { plan_id: premium.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: premium.id },
						customize: {
							price: itemsV2.monthlyPrice({ amount: 100 }),
						},
					},
				],
			},
		});

		const after = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({ customer: after, productId: premium.id });
		await expectProductScheduled({ customer: after, productId: pro.id });
		expect(
			await getCustomerProductPriceAmounts({
				ctx,
				customerId,
				productId: premium.id,
			}),
		).toEqual([100]);
		await expectScheduledIdsPreservedOrRewired({
			ctx,
			before: scheduledIdsBefore,
			after: await getScheduledIds({
				ctx,
				customerId,
				productId: pro.id,
			}),
		});
		await expectNoExpiredCustomerProducts({
			ctx,
			customerId,
			productId: premium.id,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("migrations update_plan states: end-of-cycle cancel survives price update")}`,
	async () => {
		const customerId = "migration-update-state-cancel";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.updateSubscription({
					productId: pro.id,
					cancelAction: "cancel_end_of_cycle",
				}),
			],
		});

		const before = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({ customer: before, productId: pro.id });

		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${customerId}-mig`,
			customerId,
			runOnServer: false,
			filter: { customer: { plan: { plan_id: pro.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: pro.id },
						customize: {
							price: itemsV2.monthlyPrice({ amount: 50 }),
						},
					},
				],
			},
		});

		const after = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({ customer: after, productId: pro.id });
		expect(
			await getCustomerProductPriceAmounts({
				ctx,
				customerId,
				productId: pro.id,
			}),
		).toEqual([50]);
		expect(
			await getScheduledIds({
				ctx,
				customerId,
				productId: pro.id,
			}),
		).toEqual([]);
		await expectNoExpiredCustomerProducts({
			ctx,
			customerId,
			productId: pro.id,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("migrations update_plan states: entity scheduled and canceling states survive")}`,
	async () => {
		const customerId = "migration-update-state-entities";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV1, autumnV2_2, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: premium.id, entityIndex: 0 }),
				s.billing.attach({ productId: premium.id, entityIndex: 1 }),
				s.billing.attach({ productId: pro.id, entityIndex: 0 }),
				s.updateSubscription({
					productId: premium.id,
					entityIndex: 1,
					cancelAction: "cancel_end_of_cycle",
				}),
			],
		});

		const entity1Before = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		const entity2Before = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[1].id,
		);
		await expectProductCanceling({
			customer: entity1Before,
			productId: premium.id,
		});
		await expectProductScheduled({
			customer: entity1Before,
			productId: pro.id,
		});
		await expectProductCanceling({
			customer: entity2Before,
			productId: premium.id,
		});
		await expectProductNotPresent({
			customer: entity2Before,
			productId: pro.id,
		});
		const scheduledIdsBefore = await getScheduledIds({
			ctx,
			customerId,
			productId: pro.id,
			entityId: entities[0].id,
		});
		expect(scheduledIdsBefore.length).toBeGreaterThan(0);

		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${customerId}-mig`,
			customerId,
			runOnServer: false,
			filter: { customer: { plan: { plan_id: premium.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: premium.id },
						customize: {
							price: itemsV2.monthlyPrice({ amount: 100 }),
						},
					},
				],
			},
		});

		const entity1After = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[0].id,
		);
		const entity2After = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			entities[1].id,
		);
		await expectProductCanceling({
			customer: entity1After,
			productId: premium.id,
		});
		await expectProductScheduled({ customer: entity1After, productId: pro.id });
		await expectProductCanceling({
			customer: entity2After,
			productId: premium.id,
		});
		await expectProductNotPresent({
			customer: entity2After,
			productId: pro.id,
		});
		expect(
			await getCustomerProductPriceAmounts({
				ctx,
				customerId,
				productId: premium.id,
				entityId: entities[0].id,
			}),
		).toEqual([100]);
		expect(
			await getCustomerProductPriceAmounts({
				ctx,
				customerId,
				productId: premium.id,
				entityId: entities[1].id,
			}),
		).toEqual([100]);
		await expectScheduledIdsPreservedOrRewired({
			ctx,
			before: scheduledIdsBefore,
			after: await getScheduledIds({
				ctx,
				customerId,
				productId: pro.id,
				entityId: entities[0].id,
			}),
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	`${chalk.yellowBright("migrations update_plan states: multi-product scheduled downgrade and canceling addon survive")}`,
	async () => {
		const customerId = "migration-update-state-products";
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});
		const addon = products.recurringAddOn({
			items: [items.monthlyWords({ includedUsage: 300 })],
		});

		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium, addon] }),
			],
			actions: [
				s.billing.attach({ productId: premium.id }),
				s.billing.attach({ productId: addon.id }),
				s.billing.attach({ productId: pro.id }),
				s.updateSubscription({
					productId: addon.id,
					cancelAction: "cancel_end_of_cycle",
				}),
			],
		});

		const before = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({ customer: before, productId: premium.id });
		await expectProductScheduled({ customer: before, productId: pro.id });
		await expectProductCanceling({ customer: before, productId: addon.id });
		const scheduledIdsBefore = await getScheduledIds({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(scheduledIdsBefore.length).toBeGreaterThan(0);

		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_2,
			migrationId: `${customerId}-mig`,
			customerId,
			runOnServer: false,
			filter: {
				customer: {
					plan: { $or: [{ plan_id: premium.id }, { plan_id: addon.id }] },
				},
			},
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: premium.id },
						customize: {
							price: itemsV2.monthlyPrice({ amount: 100 }),
						},
					},
					{
						type: "update_plan",
						plan_filter: { plan_id: addon.id },
						customize: {
							price: itemsV2.monthlyPrice({ amount: 40 }),
						},
					},
				],
			},
		});

		const after = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductCanceling({ customer: after, productId: premium.id });
		await expectProductScheduled({ customer: after, productId: pro.id });
		await expectProductCanceling({ customer: after, productId: addon.id });
		expect(
			await getCustomerProductPriceAmounts({
				ctx,
				customerId,
				productId: premium.id,
			}),
		).toEqual([100]);
		expect(
			await getCustomerProductPriceAmounts({
				ctx,
				customerId,
				productId: addon.id,
			}),
		).toEqual([40]);
		await expectScheduledIdsPreservedOrRewired({
			ctx,
			before: scheduledIdsBefore,
			after: await getScheduledIds({
				ctx,
				customerId,
				productId: pro.id,
			}),
		});
		await expectNoExpiredCustomerProducts({
			ctx,
			customerId,
			productId: premium.id,
		});
		await expectNoExpiredCustomerProducts({
			ctx,
			customerId,
			productId: addon.id,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
