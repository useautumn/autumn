import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type ApiCustomerV5,
	findActiveCustomerProductById,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { runUpdatePlanMigration } from "../migrations-v2/utils/runUpdatePlanMigration";
import {
	getSubscriptionIdsForProduct,
	linkCustomerProductToCanceledSubscription,
	listStripeSubscriptions,
} from "./utils/canceledSubscriptionUtils";

const getInvoiceCount = async ({
	autumnV1,
	customerId,
}: {
	autumnV1: { customers: { get: <T>(id: string) => Promise<T> } };
	customerId: string;
}) =>
	(await autumnV1.customers.get<ApiCustomerV3>(customerId)).invoices?.length ??
	0;

const getFixedPriceAmounts = async ({
	ctx,
	customerId,
	productId,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		skipReset: true,
	});
	const customerProduct = findActiveCustomerProductById({
		fullCus: fullCustomer,
		productId,
	});

	return (customerProduct?.customer_prices ?? [])
		.map(({ price }) =>
			price.config && "amount" in price.config
				? price.config.amount
				: undefined,
		)
		.filter((amount): amount is number => typeof amount === "number")
		.sort((a, b) => a - b);
};

test(`${chalk.yellowBright("canceled sub migration: add_items applies without a new sub or charge")}`, async () => {
	const customerId = "canceled-sub-mig-add-items";
	const pro = products.pro({ id: "pro", items: [] });

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const { subscriptionId, stripeCustomerId } =
		await linkCustomerProductToCanceledSubscription({
			ctx,
			customerId,
			productId: pro.id,
		});

	const invoiceCountBefore = await getInvoiceCount({ autumnV1, customerId });
	const subscriptionsBefore = await listStripeSubscriptions({
		ctx,
		stripeCustomerId,
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
					customize: {
						add_items: [
							itemsV2.dashboard(),
							itemsV2.monthlyMessages({ included: 200 }),
						],
					},
				},
			],
		},
	});

	const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
	await expectCustomerProducts({ customer, active: [pro.id] });
	expectFlagCorrect({
		customer,
		featureId: TestFeature.Dashboard,
		planId: pro.id,
	});
	expectBalanceCorrect({
		customer,
		featureId: TestFeature.Messages,
		remaining: 200,
		usage: 0,
		planId: pro.id,
	});

	const subscriptionsAfter = await listStripeSubscriptions({
		ctx,
		stripeCustomerId,
	});
	expect(subscriptionsAfter.map((sub) => sub.id).sort()).toEqual(
		subscriptionsBefore.map((sub) => sub.id).sort(),
	);
	expect(
		subscriptionsAfter.every((sub) => sub.status === "canceled"),
		"every stripe subscription should still be canceled",
	).toBe(true);

	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: invoiceCountBefore,
	});
	expect(
		await getSubscriptionIdsForProduct({ ctx, customerId, productId: pro.id }),
	).toEqual([subscriptionId]);
});

test(`${chalk.yellowBright("canceled sub migration: prorated base price change bills the live sub but not the canceled one")}`, async () => {
	const customerId = "canceled-sub-mig-price";
	const controlKey = "canceled-sub-mig-price-control";
	const pro = products.pro({ id: "pro", items: [] });

	const { autumnV1, autumnV2_2, ctx, otherCustomers } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([{ id: controlKey, paymentMethod: "success" }]),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.billing.attach({ productId: pro.id, customerId: controlKey }),
		],
	});

	const controlId = otherCustomers.get(controlKey)?.id;
	if (!controlId) throw new Error("control customer not created");

	const { stripeCustomerId } = await linkCustomerProductToCanceledSubscription({
		ctx,
		customerId,
		productId: pro.id,
	});

	const priceMigration = {
		filter: { customer: { plan: { plan_id: pro.id } } },
		operations: {
			customer: [
				{
					type: "update_plan" as const,
					plan_filter: { plan_id: pro.id },
					customize: { price: itemsV2.monthlyPrice({ amount: 50 }) },
					proration: true,
				},
			],
		},
	};

	const controlInvoicesBefore = await getInvoiceCount({
		autumnV1,
		customerId: controlId,
	});

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${controlKey}-mig`,
		customerId: controlId,
		runOnServer: false,
		...priceMigration,
	});

	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(controlId),
		count: controlInvoicesBefore + 1,
	});
	expect(
		await getFixedPriceAmounts({
			ctx,
			customerId: controlId,
			productId: pro.id,
		}),
	).toEqual([50]);

	const invoiceCountBefore = await getInvoiceCount({ autumnV1, customerId });
	const subscriptionsBefore = await listStripeSubscriptions({
		ctx,
		stripeCustomerId,
	});

	await runUpdatePlanMigration({
		ctx,
		migrationClient: autumnV2_2,
		migrationId: `${customerId}-mig`,
		customerId,
		runOnServer: false,
		...priceMigration,
	});

	await expectCustomerInvoiceCorrect({
		customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
		count: invoiceCountBefore,
	});

	const subscriptionsAfter = await listStripeSubscriptions({
		ctx,
		stripeCustomerId,
	});
	expect(subscriptionsAfter.map((sub) => sub.id).sort()).toEqual(
		subscriptionsBefore.map((sub) => sub.id).sort(),
	);
	expect(
		subscriptionsAfter.every((sub) => sub.status === "canceled"),
		"every stripe subscription should still be canceled",
	).toBe(true);

	expect(
		await getFixedPriceAmounts({ ctx, customerId, productId: pro.id }),
	).toEqual([50]);
});
