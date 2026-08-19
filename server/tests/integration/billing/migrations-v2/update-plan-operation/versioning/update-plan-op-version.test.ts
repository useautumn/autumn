/** Pre-fix, multi-entity pooled versioning inserts duplicate pools and leaves duplicate active plans.
 * Post-fix, planning converges on one shared pool before execution. */

import { test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	CusProductStatus,
	EntInterval,
	PooledBalanceResetMode,
} from "@autumn/shared";
import { expectPooledBalanceCorrect } from "@tests/integration/billing/pooled-balances/utils/expectPooledBalanceCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectCustomerProductStatuses } from "@tests/integration/billing/utils/expectCustomerProductStatuses";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runUpdatePlanMigration } from "../../utils/runUpdatePlanMigration";

test.concurrent(`${chalk.yellowBright("migrations update_plan: free version update carries usage")}`, async () => {
	const customerId = "migration-update-free-version";
	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free] }),
		],
		actions: [
			s.billing.attach({ productId: free.id }),
			s.track({ featureId: TestFeature.Messages, value: 100, timeout: 2000 }),
		],
	});

	await autumnV1.products.update(free.id, {
		items: [items.monthlyMessages({ includedUsage: 600 })],
	});

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		customerId,
		filter: { customer: { plan: { plan_id: free.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: free.id },
					version: 2,
				},
			],
		},
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [free.id] });
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 500,
		usage: 100,
		planId: free.id,
	});
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 0,
	});
});

test.concurrent(`${chalk.yellowBright("migrations update_plan: paid version update does not invoice")}`, async () => {
	const customerId = "migration-update-paid-version";
	const pro = products.pro({
		id: "pro",
		items: [items.consumableMessages({ includedUsage: 500 })],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 600, timeout: 2000 }),
		],
	});
	const invoiceCountBefore =
		(await autumnV1.customers.get<ApiCustomerV3>(customerId)).invoices
			?.length ?? 0;

	await autumnV1.products.update(pro.id, {
		items: [
			items.monthlyPrice({ price: 30 }),
			items.consumableMessages({ includedUsage: 600 }),
		],
	});

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		customerId,
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

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id] });
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 0,
		usage: 600,
		planId: pro.id,
	});
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: invoiceCountBefore,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(`${chalk.yellowBright("migrations update_plan: prepaid version update preserves quantity")}`, async () => {
	const customerId = "migration-update-prepaid-version";
	const pro = products.pro({
		id: "pro",
		items: [
			items.prepaidMessages({
				includedUsage: 0,
				billingUnits: 100,
				price: 10,
			}),
		],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({
				productId: pro.id,
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});
	const invoiceCountBefore =
		(await autumnV1.customers.get<ApiCustomerV3>(customerId)).invoices
			?.length ?? 0;

	await autumnV1.products.update(pro.id, {
		items: [
			items.monthlyPrice({ price: 20 }),
			items.prepaidMessages({
				includedUsage: 100,
				billingUnits: 100,
				price: 10,
			}),
		],
	});

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		customerId,
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

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id] });
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 200,
		usage: 0,
		planId: pro.id,
	});
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: invoiceCountBefore,
	});
	await expectStripeSubscriptionCorrect({ ctx, customerId });
});

test.concurrent(
	`${chalk.yellowBright("migrations update_plan: pooled version update coalesces entity products")}`,
	async () => {
		const customerId = "migration-update-pooled-entities";
		const grant = 100;
		const free = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: grant })],
		});

		const { autumnV1, autumnV2_3, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer(),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [free] }),
			],
			actions: [
				s.billing.attach({ productId: free.id, entityIndex: 0 }),
				s.billing.attach({ productId: free.id, entityIndex: 1 }),
			],
		});

		await autumnV1.products.update(free.id, {
			items: [
				{
					...items.monthlyMessages({ includedUsage: grant }),
					pooled: true,
				},
			],
		});

		await runUpdatePlanMigration({
			ctx,
			migrationClient: autumnV2_3,
			migrationId: `${customerId}-mig`,
			customerId,
			filter: { customer: { plan: { plan_id: free.id } } },
			operations: {
				customer: [
					{
						type: "update_plan",
						plan_filter: { plan_id: free.id },
						version: 2,
					},
				],
			},
			runOnServer: false,
		});

		for (const entity of entities) {
			await expectCustomerProductStatuses({
				ctx,
				customerId,
				productId: free.id,
				entityId: entity.id,
				expected: {
					[CusProductStatus.Active]: 1,
					[CusProductStatus.Expired]: 1,
				},
			});
		}
		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: grant * entities.length,
				adjustment: 0,
				granted: grant * entities.length,
				interval: EntInterval.Month,
				nextResetAt: "present",
				resetCycleAnchor: "present",
				resetMode: PooledBalanceResetMode.Lazy,
				stripeSubscriptionId: null,
			},
			contributions: {
				count: entities.length,
				currentContribution: grant,
				nextCycleContribution: grant,
			},
			sources: {
				count: entities.length,
				balance: 0,
				adjustment: 0,
			},
		});
	},
);
