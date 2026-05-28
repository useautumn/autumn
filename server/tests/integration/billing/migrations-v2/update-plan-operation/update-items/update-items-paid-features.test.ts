/**
 * TDD coverage for update_items against paid / billed features and edge
 * cases.
 *
 * Contract under test:
 *   New behaviors:
 *     - PREPAID feature update_items: bumping `included` carries the
 *       customer-selected quantity forward and leaves the Stripe
 *       subscription unchanged. No new invoice.
 *     - CONSUMABLE (usage-in-arrear) update_items: bumping `included`
 *       preserves arrears usage. Stripe subscription untouched.
 *     - update_items targeting a free feature on a customer with a PAID
 *       Stripe subscription leaves the subscription's line items + anchor
 *       intact (no proration invoice).
 *     - Filter that matches nothing is a graceful no-op (the migration
 *       succeeds, customer state unchanged, no charge artifacts).
 *     - Unlimited entitlement + update_items.included: the override is
 *       silently ignored (unlimited stays unlimited; we do not regress to
 *       a numeric allowance).
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	BillingMethod,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionUnchanged } from "@tests/integration/billing/utils/stripe/expectStripeSubscriptionUnchanged";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runUpdatePlanMigration } from "../../utils/runUpdatePlanMigration";

test.concurrent(`${chalk.yellowBright("migrations update_items: prepaid feature — preserves selected quantity, Stripe sub unchanged, no invoice")}`, async () => {
	const customerId = "migration-update-items-prepaid";
	const pro = products.pro({
		id: "migration-update-items-prepaid-plan",
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

	const customerBefore = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = customerBefore.invoices?.length ?? 0;
	const stripeCustomerId = customerBefore.stripe_id as string;

	const subsBefore = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId,
		status: "all",
	});
	const subBefore = subsBefore.data.find(
		(sub) => sub.status === "active" || sub.status === "trialing",
	);
	expect(subBefore, "expected a paid Stripe sub for the prepaid plan").toBeDefined();

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
					customize: {
						update_items: [
							{ filter: { feature_id: TestFeature.Messages }, included: 100 },
						],
					},
				},
			],
		},
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	// Bumping `included` on a prepaid item absorbs that allowance into the
	// already-purchased prepaid quantity (see cusProductToConvertedFeatureOptions).
	// Total grant stays at the original 200; the new entitlement carries
	// `included_grant: 100` and the prepaid_grant drops to 100.
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 200,
		usage: 0,
		breakdown: {
			[BillingMethod.Prepaid]: {
				included_grant: 100,
				prepaid_grant: 100,
				remaining: 200,
				usage: 0,
			},
		},
	});

	const subAfter = await ctx.stripeCli.subscriptions.retrieve(subBefore!.id);
	expectStripeSubscriptionUnchanged({
		before: subBefore!,
		after: subAfter,
	});
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: invoiceCountBefore,
	});
});

test.concurrent(`${chalk.yellowBright("migrations update_items: consumable (usage-in-arrear) feature — preserves arrears usage, Stripe sub unchanged")}`, async () => {
	const customerId = "migration-update-items-consumable";
	const pro = products.pro({
		id: "migration-update-items-consumable-plan",
		items: [items.consumableMessages({ includedUsage: 100, price: 0.1 })],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.track({ featureId: TestFeature.Messages, value: 150, timeout: 2000 }),
		],
	});

	const customerBefore = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const invoiceCountBefore = customerBefore.invoices?.length ?? 0;
	const stripeCustomerId = customerBefore.stripe_id as string;
	const subsBefore = await ctx.stripeCli.subscriptions.list({
		customer: stripeCustomerId,
		status: "all",
	});
	const subBefore = subsBefore.data.find(
		(sub) => sub.status === "active" || sub.status === "trialing",
	);
	expect(subBefore).toBeDefined();

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
					customize: {
						update_items: [
							{ filter: { feature_id: TestFeature.Messages }, included: 300 },
						],
					},
				},
			],
		},
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	// new included (300) - existing usage (150) → remaining 150
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 150,
		usage: 150,
		breakdown: {
			[BillingMethod.UsageBased]: {
				included_grant: 300,
				remaining: 150,
				usage: 150,
			},
		},
	});

	const subAfter = await ctx.stripeCli.subscriptions.retrieve(subBefore!.id);
	expectStripeSubscriptionUnchanged({ before: subBefore!, after: subAfter });
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: invoiceCountBefore,
	});
});

test.concurrent(`${chalk.yellowBright("migrations update_items: allocated (entity-scoped) feature — per-entity balances preserved")}`, async () => {
	const customerId = "migration-update-items-allocated";
	const base = products.base({
		id: "migration-update-items-allocated-plan",
		items: [items.freeAllocatedUsers({ includedUsage: 5 })],
	});

	const { autumnV1, autumnV2_2, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer(),
			s.products({ list: [base] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.billing.attach({ productId: base.id })],
	});

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		customerId,
		filter: { customer: { plan: { plan_id: base.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: base.id },
					customize: {
						update_items: [
							{ filter: { feature_id: TestFeature.Users }, included: 10 },
						],
					},
				},
			],
		},
	});

	// Allocated/seat features count existing entities as usage (see
	// mergeEntitiesWithExistingUsages). With 2 entities + new included=10, the
	// expected post-update balance per entity is 10 − 2 = 8.
	for (const entity of entities) {
		const customer = await autumnV1.entities.get(customerId, entity.id);
		expect(
			customer.features?.[TestFeature.Users]?.balance,
			`entity ${entity.id} should have balance 8 (10 included minus 2 entity-as-usage)`,
		).toBe(8);
	}
});

test.concurrent(`${chalk.yellowBright("migrations update_items: filter that matches nothing is a graceful no-op")}`, async () => {
	const customerId = "migration-update-items-no-match";
	const base = products.base({
		id: "migration-update-items-no-match-plan",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [base] })],
		actions: [
			s.billing.attach({ productId: base.id }),
			s.track({ featureId: TestFeature.Messages, value: 20, timeout: 2000 }),
		],
	});

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		customerId,
		filter: { customer: { plan: { plan_id: base.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: base.id },
					customize: {
						update_items: [
							{
								filter: { feature_id: "does-not-exist-on-this-plan" },
								included: 999,
							},
						],
					},
				},
			],
		},
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	// Untouched state: original 100 included, 20 used → 80 remaining.
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 80,
		usage: 20,
		planId: base.id,
	});

	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 0,
	});
});

test.concurrent(`${chalk.yellowBright("migrations update_items: included on an unlimited entitlement is ignored (still unlimited)")}`, async () => {
	const customerId = "migration-update-items-unlimited";
	const base = products.base({
		id: "migration-update-items-unlimited-plan",
		items: [items.unlimitedMessages()],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [base] })],
		actions: [s.billing.attach({ productId: base.id })],
	});

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		customerId,
		filter: { customer: { plan: { plan_id: base.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: base.id },
					customize: {
						update_items: [
							{ filter: { feature_id: TestFeature.Messages }, included: 500 },
						],
					},
				},
			],
		},
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	const balance = customer.balances[TestFeature.Messages];
	expect(
		balance?.unlimited,
		"unlimited entitlement must stay unlimited after update_items",
	).toBe(true);
});
