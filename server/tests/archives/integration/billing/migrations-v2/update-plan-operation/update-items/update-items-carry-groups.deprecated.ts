import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	BillingInterval,
	BillingMethod,
	ProductItemInterval,
	ResetInterval,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	constructFeatureItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem";
import { runUpdatePlanMigration } from "../../utils/runUpdatePlanMigration";

type BalanceBreakdown = NonNullable<
	ApiCustomerV5["balances"][string]["breakdown"]
>[number];

const dailyCredits = ({ includedUsage = 50 }: { includedUsage?: number } = {}) =>
	constructFeatureItem({
		featureId: TestFeature.Credits,
		includedUsage,
		interval: ProductItemInterval.Day,
	});

const oneOffPrepaidCredits = ({
	includedUsage = 0,
	billingUnits = 100,
	price = 10,
}: {
	includedUsage?: number;
	billingUnits?: number;
	price?: number;
} = {}) =>
	constructPrepaidItem({
		featureId: TestFeature.Credits,
		includedUsage,
		billingUnits,
		price,
		isOneOff: true,
	});

const getBucket = ({
	customer,
	billingMethod,
	resetInterval,
}: {
	customer: ApiCustomerV5;
	billingMethod?: BillingMethod;
	resetInterval?: ResetInterval | null;
}): BalanceBreakdown => {
	const bucket = customer.balances[TestFeature.Credits]?.breakdown?.find(
		(candidate) => {
			if (
				billingMethod &&
				candidate.price?.billing_method !== billingMethod
			) {
				return false;
			}
			if (resetInterval === null) return candidate.reset === null;
			if (resetInterval) return candidate.reset?.interval === resetInterval;
			return true;
		},
	);
	expect(bucket).toBeDefined();
	return bucket!;
};

test.concurrent(`${chalk.yellowBright("migrations update_items: daily and monthly credits carry separately when both are updated")}`, async () => {
	const customerId = "migration-update-items-daily-monthly-carry";
	const base = products.base({
		id: "migration-update-items-daily-monthly-carry-plan",
		items: [
			dailyCredits({ includedUsage: 50 }),
			items.monthlyCredits({ includedUsage: 100 }),
			constructFeatureItem({
				featureId: TestFeature.Credits,
				includedUsage: 100,
				interval: null,
			}),
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
						update_items: [
							{
								filter: {
									feature_id: TestFeature.Credits,
									interval: ProductItemInterval.Day,
								},
								included: 80,
							},
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
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Credits,
		remaining: 280,
		usage: 100,
		breakdown: {
			[ResetInterval.Day]: { included_grant: 80, remaining: 50, usage: 30 },
			[ResetInterval.Month]: { included_grant: 200, remaining: 160, usage: 40 },
			[ResetInterval.OneOff]: { included_grant: 100, remaining: 70, usage: 30 },
		},
	});
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: 0,
	});
});

test.concurrent(`${chalk.yellowBright("migrations update_items: prepaid and usage-based credits carry by billing method")}`, async () => {
	const customerId = "migration-update-items-billing-method-carry";
	const pro = products.pro({
		id: "migration-update-items-billing-method-carry-plan",
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
	const prepaidBucket = getBucket({
		customer: initialCustomer,
		billingMethod: BillingMethod.Prepaid,
	});
	const usageBasedBucket = getBucket({
		customer: initialCustomer,
		billingMethod: BillingMethod.UsageBased,
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
		current_balance: 250,
		balance_id: prepaidBucket.id,
	});
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
		current_balance: 30,
		balance_id: usageBasedBucket.id,
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
							},
							{
								filter: {
									feature_id: TestFeature.Credits,
									billing_method: BillingMethod.UsageBased,
									interval: BillingInterval.Month,
								},
								included: 100,
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
		breakdown: {
			[BillingMethod.Prepaid]: {
				included_grant: 200,
				prepaid_grant: 100,
				remaining: 250,
				usage: 50,
			},
			[BillingMethod.UsageBased]: {
				included_grant: 100,
				remaining: 80,
				usage: 20,
			},
		},
	});
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: invoiceCountBefore,
	});
});

test.concurrent(`${chalk.yellowBright("migrations update_items: one-off prepaid balance survives alongside monthly carry")}`, async () => {
	const customerId = "migration-update-items-one-off-prepaid-carry";
	const pro = products.pro({
		id: "migration-update-items-one-off-prepaid-carry-plan",
		items: [
			items.monthlyCredits({ includedUsage: 100 }),
			oneOffPrepaidCredits({ includedUsage: 0, billingUnits: 100 }),
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
				options: [{ feature_id: TestFeature.Credits, quantity: 200 }],
			}),
		],
	});
	const initialCustomer =
		await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	const monthlyBucket = getBucket({
		customer: initialCustomer,
		resetInterval: ResetInterval.Month,
	});
	const oneOffBucket = getBucket({
		customer: initialCustomer,
		billingMethod: BillingMethod.Prepaid,
		resetInterval: ResetInterval.OneOff,
	});

	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
		current_balance: 60,
		balance_id: monthlyBucket.id,
	});
	await autumnV2.balances.update({
		customer_id: customerId,
		feature_id: TestFeature.Credits,
		current_balance: 150,
		balance_id: oneOffBucket.id,
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
							{
								filter: {
									feature_id: TestFeature.Credits,
									billing_method: BillingMethod.Prepaid,
									interval: BillingInterval.OneOff,
								},
								included: 25,
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
		remaining: 335,
		usage: 40,
		breakdown: {
			[ResetInterval.Month]: { included_grant: 200, remaining: 160, usage: 40 },
			[BillingMethod.Prepaid]: {
				included_grant: 175,
				prepaid_grant: 0,
				remaining: 175,
				usage: 0,
			},
		},
	});
	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: invoiceCountBefore,
	});
});
