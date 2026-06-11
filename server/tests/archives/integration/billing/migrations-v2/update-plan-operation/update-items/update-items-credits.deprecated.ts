import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	type ApiEntityV2,
	BillingInterval,
	BillingMethod,
	ProductItemInterval,
	ResetInterval,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem";
import { runUpdatePlanMigration } from "../../utils/runUpdatePlanMigration";

const dailyCredits = ({ includedUsage = 50 }: { includedUsage?: number } = {}) =>
	constructFeatureItem({
		featureId: TestFeature.Credits,
		includedUsage,
		interval: ProductItemInterval.Day,
	});

const lifetimeCredits = ({
	includedUsage = 50,
}: {
	includedUsage?: number;
} = {}) =>
	constructFeatureItem({
		featureId: TestFeature.Credits,
		includedUsage,
		interval: null,
	});

test.concurrent(`${chalk.yellowBright("migrations update_items: removes daily credits while monthly usage carry stays scoped")}`, async () => {
	const customerId = "migration-update-items-credits-daily-remove";
	const base = products.base({
		id: "migration-update-items-credits-daily-remove-plan",
		items: [
			dailyCredits({ includedUsage: 50 }),
			items.monthlyCredits({ includedUsage: 100 }),
			lifetimeCredits({ includedUsage: 100 }),
		],
	});

	const { autumnV1, autumnV2, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [base] })],
		actions: [s.billing.attach({ productId: base.id })],
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
		current_balance: 20,
		interval: ResetInterval.Day,
	});
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
		current_balance: 60,
		interval: ResetInterval.Month,
	});
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
		current_balance: 70,
		interval: ResetInterval.OneOff,
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
						remove_items: [
							{
								feature_id: TestFeature.Credits,
								interval: ResetInterval.Day,
							},
						],
						update_items: [
							{
								filter: {
									feature_id: TestFeature.Credits,
									interval: BillingInterval.Month,
								},
								included: 200,
							},
						],
					},
				},
			],
		},
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [base.id] });
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Credits,
		remaining: 230,
		usage: 70,
		planId: base.id,
		breakdown: {
			[ResetInterval.Month]: { included_grant: 200, remaining: 160, usage: 40 },
			[ResetInterval.OneOff]: { included_grant: 100, remaining: 70, usage: 30 },
		},
	});
	expect(
		customer.balances[TestFeature.Credits]?.breakdown?.some(
			(bucket) => bucket.reset?.interval === ResetInterval.Day,
		),
	).toBe(false);

	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 0,
	});
});

test.concurrent(`${chalk.yellowBright("migrations update_items: prepaid credits keep prepaid bucket beside lifetime credits")}`, async () => {
	const customerId = "migration-update-items-prepaid-credits";
	const pro = products.pro({
		id: "migration-update-items-prepaid-credits-plan",
		items: [
			items.prepaid({
				featureId: TestFeature.Credits,
				includedUsage: 100,
				billingUnits: 100,
				price: 10,
			}),
			lifetimeCredits({ includedUsage: 50 }),
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
				options: [{ feature_id: TestFeature.Credits, quantity: 300 }],
			}),
			s.track({ featureId: TestFeature.Credits, value: 125, timeout: 2000 }),
		],
	});
	const invoiceCountBefore =
		(await autumnV1.customers.get<ApiCustomerV3>(customerId)).invoices?.length ??
		0;

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
							{
								filter: {
									feature_id: TestFeature.Credits,
									interval: BillingInterval.Month,
								},
								included: 200,
							},
						],
					},
				},
			],
		},
		noBillingChanges: true,
		runOnServer: false,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Credits,
		remaining: 225,
		usage: 125,
		planId: pro.id,
		breakdown: {
			[BillingMethod.Prepaid]: {
				included_grant: 200,
				prepaid_grant: 100,
				remaining: 175,
				usage: 125,
			},
			[ResetInterval.OneOff]: { included_grant: 50, remaining: 50, usage: 0 },
		},
	});
	expect(
		customer.balances[TestFeature.Credits]?.breakdown?.filter(
			(bucket) => bucket.reset?.interval === ResetInterval.OneOff,
		).length,
	).toBe(1);
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: invoiceCountBefore,
	});
});

test.concurrent(`${chalk.yellowBright("migrations update_items: customer plan monthly credits and addon lifetime credits stay separate")}`, async () => {
	const customerId = "migration-update-items-addon-lifetime-credits";
	const pro = products.pro({
		id: "migration-update-items-addon-lifetime-credits-pro",
		items: [items.monthlyCredits({ includedUsage: 100 })],
	});
	const addon = products.recurringAddOn({
		id: "migration-update-items-addon-lifetime-credits-addon",
		items: [lifetimeCredits({ includedUsage: 500 })],
	});

	const { autumnV1, autumnV2, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.billing.attach({ productId: addon.id }),
		],
	});
	const invoiceCountBefore =
		(await autumnV1.customers.get<ApiCustomerV3>(customerId)).invoices?.length ??
		0;

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
		current_balance: 80,
		interval: ResetInterval.Month,
	});
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
		current_balance: 400,
		interval: ResetInterval.OneOff,
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
					customize: {
						update_items: [
							{
								filter: {
									feature_id: TestFeature.Credits,
									interval: BillingInterval.Month,
								},
								included: 200,
							},
						],
					},
				},
			],
		},
		noBillingChanges: true,
		runOnServer: false,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id, addon.id] });
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Credits,
		remaining: 580,
		usage: 120,
		breakdown: {
			[ResetInterval.Month]: { included_grant: 200, remaining: 180, usage: 20 },
			[ResetInterval.OneOff]: {
				included_grant: 500,
				remaining: 400,
				usage: 100,
			},
		},
	});
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: invoiceCountBefore,
	});
});

test.concurrent(`${chalk.yellowBright("migrations update_items: entity-level credits are migrated per entity product")}`, async () => {
	const customerId = "migration-update-items-entity-credits";
	const pro = products.pro({
		id: "migration-update-items-entity-credits-plan",
		items: [
			items.monthlyCredits({ includedUsage: 100 }),
			lifetimeCredits({ includedUsage: 50 }),
		],
	});

	const { autumnV1, autumnV2_2, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: pro.id, entityIndex: 0 }),
			s.billing.attach({ productId: pro.id, entityIndex: 1 }),
			s.track({
				featureId: TestFeature.Credits,
				value: 30,
				entityIndex: 0,
				timeout: 2000,
			}),
			s.track({
				featureId: TestFeature.Credits,
				value: 60,
				entityIndex: 1,
				timeout: 2000,
			}),
		],
	});
	const invoiceCountBefore =
		(await autumnV1.customers.get<ApiCustomerV3>(customerId)).invoices?.length ??
		0;

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
							{
								filter: {
									feature_id: TestFeature.Credits,
									interval: BillingInterval.Month,
								},
								included: 200,
							},
						],
					},
				},
			],
		},
		noBillingChanges: true,
		runOnServer: false,
	});

	const firstEntity = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[0].id,
	);
	const secondEntity = await autumnV2_2.entities.get<ApiEntityV2>(
		customerId,
		entities[1].id,
	);

	expectBalanceCorrect({
		customer: firstEntity,
		featureId: TestFeature.Credits,
		remaining: 220,
		usage: 30,
		planId: pro.id,
		breakdown: {
			[ResetInterval.Month]: { included_grant: 200, remaining: 170, usage: 30 },
			[ResetInterval.OneOff]: { included_grant: 50, remaining: 50, usage: 0 },
		},
	});
	expectBalanceCorrect({
		customer: secondEntity,
		featureId: TestFeature.Credits,
		remaining: 190,
		usage: 60,
		planId: pro.id,
		breakdown: {
			[ResetInterval.Month]: { included_grant: 200, remaining: 140, usage: 60 },
			[ResetInterval.OneOff]: { included_grant: 50, remaining: 50, usage: 0 },
		},
	});
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: invoiceCountBefore,
	});
});
