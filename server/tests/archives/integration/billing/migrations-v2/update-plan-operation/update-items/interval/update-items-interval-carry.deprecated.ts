import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	type ApiEntityV2,
	BillingInterval,
	BillingMethod,
	ResetInterval,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { runUpdatePlanMigration } from "../../../utils/runUpdatePlanMigration";
import { getCreditBucket, lifetimeCredits } from "./updateIntervalTestUtils";

test.concurrent(`${chalk.yellowBright("migrations update_items interval: mixed update carries per entity with same-feature cusEnts")}`, async () => {
	const customerId = "migration-update-items-mixed-entity-same-feature";
	const base = products.base({
		id: "migration-update-items-mixed-entity-same-feature-plan",
		items: [
			items.monthlyCredits({ includedUsage: 100 }),
			lifetimeCredits({ includedUsage: 50 }),
		],
	});

	const { autumnV1, autumnV2_2, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer(),
			s.products({ list: [base] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.billing.attach({ productId: base.id, entityIndex: 0 }),
			s.billing.attach({ productId: base.id, entityIndex: 1 }),
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
								filter: {
									feature_id: TestFeature.Credits,
									interval: BillingInterval.Month,
								},
								included: 200,
								interval: ResetInterval.OneOff,
							},
						],
					},
				},
			],
		},
		runOnServer: false,
	});

	for (const scenario of [
		{ entityId: entities[0].id, usage: 30, remaining: 220 },
		{ entityId: entities[1].id, usage: 60, remaining: 190 },
	]) {
		const entity = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			scenario.entityId,
		);
		expectBalanceCorrect({
			customer: entity,
			featureId: TestFeature.Credits,
			remaining: scenario.remaining,
			usage: scenario.usage,
			nextResetAt: null,
			planId: base.id,
		});

		const oneOffBuckets = entity.balances[
			TestFeature.Credits
		].breakdown?.filter(
			(bucket) => bucket.reset?.interval === ResetInterval.OneOff,
		);
		expect(oneOffBuckets).toHaveLength(2);
		expect(oneOffBuckets).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					included_grant: 50,
					remaining: 50,
					usage: 0,
				}),
				expect.objectContaining({
					included_grant: 200,
					remaining: scenario.remaining - 50,
					usage: scenario.usage,
				}),
			]),
		);
	}

	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 0,
	});
});

test.concurrent(`${chalk.yellowBright("migrations update_items interval: monthly to one-off preserves existing lifetime usage")}`, async () => {
	const customerId = "migration-update-items-lifetime-usage";
	const base = products.base({
		id: "migration-update-items-lifetime-usage-plan",
		items: [
			items.monthlyCredits({ includedUsage: 100 }),
			lifetimeCredits({ includedUsage: 80 }),
		],
	});

	const { autumnV1, autumnV2, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [base] })],
		actions: [s.billing.attach({ productId: base.id })],
	});
	const initialCustomer =
		await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
		current_balance: 70,
		balance_id: getCreditBucket({
			subject: initialCustomer,
			resetInterval: ResetInterval.Month,
			includedGrant: 100,
		}).id,
	});
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
		current_balance: 50,
		balance_id: getCreditBucket({
			subject: initialCustomer,
			resetInterval: ResetInterval.OneOff,
			includedGrant: 80,
		}).id,
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
								filter: {
									feature_id: TestFeature.Credits,
									interval: BillingInterval.Month,
								},
								included: 200,
								interval: ResetInterval.OneOff,
							},
						],
					},
				},
			],
		},
		runOnServer: false,
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Credits,
		remaining: 220,
		usage: 60,
		nextResetAt: null,
		planId: base.id,
	});
	expect(getCreditBucket({
		subject: customer,
		resetInterval: ResetInterval.OneOff,
		includedGrant: 80,
	})).toMatchObject({ remaining: 50, usage: 30 });
	expect(getCreditBucket({
		subject: customer,
		resetInterval: ResetInterval.OneOff,
		includedGrant: 200,
	})).toMatchObject({ remaining: 170, usage: 30 });
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 0,
	});
});

test.concurrent(`${chalk.yellowBright("migrations update_items interval: prepaid and usage-based one-off carry stays separated")}`, async () => {
	const customerId = "migration-update-items-interval-billing-methods";
	const pro = products.pro({
		id: "migration-update-items-interval-billing-methods-plan",
		items: [
			items.prepaid({
				featureId: TestFeature.Credits,
				includedUsage: 100,
				billingUnits: 100,
				price: 10,
			}),
			items.consumable({
				featureId: TestFeature.Credits,
				includedUsage: 50,
				price: 0.1,
			}),
		],
	});

	const { autumnV1, autumnV2, autumnV2_2, ctx } = await initScenario({
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
		],
	});
	const initialCustomer =
		await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
		current_balance: 250,
		balance_id: getCreditBucket({
			subject: initialCustomer,
			resetInterval: ResetInterval.Month,
			billingMethod: BillingMethod.Prepaid,
		}).id,
	});
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
		current_balance: 30,
		balance_id: getCreditBucket({
			subject: initialCustomer,
			resetInterval: ResetInterval.Month,
			billingMethod: BillingMethod.UsageBased,
		}).id,
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
									billing_method: BillingMethod.Prepaid,
									interval: BillingInterval.Month,
								},
								included: 200,
								interval: ResetInterval.OneOff,
							},
							{
								filter: {
									feature_id: TestFeature.Credits,
									billing_method: BillingMethod.UsageBased,
									interval: BillingInterval.Month,
								},
								included: 100,
								interval: ResetInterval.OneOff,
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
		remaining: 330,
		usage: 70,
		nextResetAt: null,
		planId: pro.id,
	});
	expect(getCreditBucket({
		subject: customer,
		resetInterval: ResetInterval.OneOff,
		billingMethod: BillingMethod.Prepaid,
	})).toMatchObject({
		included_grant: 200,
		prepaid_grant: 100,
		remaining: 250,
		usage: 50,
	});
	expect(getCreditBucket({
		subject: customer,
		resetInterval: ResetInterval.OneOff,
		billingMethod: BillingMethod.UsageBased,
	})).toMatchObject({
		included_grant: 100,
		remaining: 80,
		usage: 20,
	});
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: invoiceCountBefore,
	});
});

test.concurrent(`${chalk.yellowBright("migrations update_items interval: carry links do not leak across add-ons")}`, async () => {
	const customerId = "migration-update-items-interval-addon-isolation";
	const pro = products.pro({
		id: "migration-update-items-interval-addon-isolation-pro",
		items: [items.monthlyCredits({ includedUsage: 100 })],
	});
	const addon = products.recurringAddOn({
		id: "migration-update-items-interval-addon-isolation-addon",
		items: [items.monthlyCredits({ includedUsage: 500 })],
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
	const initialCustomer =
		await autumnV2_2.customers.get<ApiCustomerV5>(customerId);

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
		current_balance: 70,
		balance_id: getCreditBucket({
			subject: initialCustomer,
			planId: pro.id,
			resetInterval: ResetInterval.Month,
		}).id,
	});
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
		current_balance: 450,
		balance_id: getCreditBucket({
			subject: initialCustomer,
			planId: addon.id,
			resetInterval: ResetInterval.Month,
		}).id,
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
								interval: ResetInterval.OneOff,
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
		remaining: 620,
		usage: 80,
	});
	expect(getCreditBucket({
		subject: customer,
		planId: pro.id,
		resetInterval: ResetInterval.OneOff,
	})).toMatchObject({
		included_grant: 200,
		remaining: 170,
		usage: 30,
	});
	expect(getCreditBucket({
		subject: customer,
		planId: addon.id,
		resetInterval: ResetInterval.Month,
	})).toMatchObject({
		included_grant: 500,
		remaining: 450,
		usage: 50,
	});
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: invoiceCountBefore,
	});
});
