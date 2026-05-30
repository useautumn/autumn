import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	CusProductStatus,
	cp,
	type FullCustomer,
	ProductItemInterval,
} from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

const getCustomerProductsByProductId = ({
	fullCustomer,
	productId,
}: {
	fullCustomer: FullCustomer;
	productId: string;
}) =>
	fullCustomer.customer_products.filter(
		(customerProduct) => cp(customerProduct).hasProductId({ productId }).valid,
	);

const getFirstSubscriptionId = ({
	subscriptionIds,
	productId,
}: {
	subscriptionIds: string[] | null | undefined;
	productId: string;
}) => {
	const subscriptionId = subscriptionIds?.[0];
	if (!subscriptionId) {
		throw new Error(`No subscription found for product ${productId}`);
	}

	return subscriptionId;
};

const createPrepaidAddon = ({
	id,
	featureId,
	interval,
}: {
	id: string;
	featureId: TestFeature;
	interval?: ProductItemInterval;
}) => {
	const item = items.prepaid({
		featureId,
		billingUnits: 100,
		price: 10,
		includedUsage: 0,
	});
	if (interval) item.interval = interval;

	return products.base({
		id,
		isAddOn: true,
		items: [item],
	});
};

test.concurrent(
	`${chalk.yellowBright("multi-attach scheduled cancel: cancel one monthly prepaid add-on does not rebill annual prepaid add-ons")}`,
	async () => {
		const customerId = "multi-attach-prepaid-cancel-renewal";
		const packQuantity = 100;

		const prepaidCreditsAddon = createPrepaidAddon({
			id: "prepaid-credits",
			featureId: TestFeature.Credits,
		});
		const prepaidWorkflowsAddon = createPrepaidAddon({
			id: "prepaid-workflows",
			featureId: TestFeature.Workflows,
			interval: ProductItemInterval.Year,
		});

		const { autumnV1, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [prepaidCreditsAddon, prepaidWorkflowsAddon] }),
			],
			actions: [
				s.billing.multiAttach({
					plans: [
						{
							productId: prepaidCreditsAddon.id,
							featureQuantities: [
								{ feature_id: TestFeature.Credits, quantity: packQuantity },
							],
						},
						{
							productId: prepaidCreditsAddon.id,
							featureQuantities: [
								{ feature_id: TestFeature.Credits, quantity: packQuantity },
							],
						},
						{
							productId: prepaidWorkflowsAddon.id,
							featureQuantities: [
								{ feature_id: TestFeature.Workflows, quantity: packQuantity },
							],
						},
						{
							productId: prepaidWorkflowsAddon.id,
							featureQuantities: [
								{ feature_id: TestFeature.Workflows, quantity: packQuantity },
							],
						},
					],
				}),
			],
		});

		const customerAfterAttach =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerInvoiceCorrect({
			customer: customerAfterAttach,
			count: 1,
			latestTotal: 40,
		});
		expectCustomerFeatureCorrect({
			customer: customerAfterAttach,
			featureId: TestFeature.Credits,
			balance: 200,
		});
		expectCustomerFeatureCorrect({
			customer: customerAfterAttach,
			featureId: TestFeature.Workflows,
			balance: 200,
		});

		const fullCustomerBeforeCancel = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const creditCustomerProducts = getCustomerProductsByProductId({
			fullCustomer: fullCustomerBeforeCancel,
			productId: prepaidCreditsAddon.id,
		});
		expect(creditCustomerProducts).toHaveLength(2);

		const workflowCustomerPriceIds = new Set(
			getCustomerProductsByProductId({
				fullCustomer: fullCustomerBeforeCancel,
				productId: prepaidWorkflowsAddon.id,
			}).flatMap((customerProduct) =>
				customerProduct.customer_prices.map(
					(customerPrice) => customerPrice.id,
				),
			),
		);
		const stripeSubscriptionId = getFirstSubscriptionId({
			subscriptionIds: creditCustomerProducts[0]!.subscription_ids,
			productId: prepaidCreditsAddon.id,
		});
		const subscriptionBeforeCancel =
			await ctx.stripeCli.subscriptions.retrieve(stripeSubscriptionId);
		const workflowSubscriptionItemIdsBeforeCancel =
			subscriptionBeforeCancel.items.data
				.filter((item) =>
					workflowCustomerPriceIds.has(item.metadata.autumn_customer_price_id),
				)
				.map((item) => item.id)
				.sort();

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			customer_product_id: creditCustomerProducts[0]!.id,
			cancel_action: "cancel_end_of_cycle" as const,
		});

		const subscriptionAfterCancel =
			await ctx.stripeCli.subscriptions.retrieve(stripeSubscriptionId);
		const workflowSubscriptionItemIdsAfterCancel =
			subscriptionAfterCancel.items.data
				.filter((item) =>
					workflowCustomerPriceIds.has(item.metadata.autumn_customer_price_id),
				)
				.map((item) => item.id)
				.sort();

		expect(workflowSubscriptionItemIdsAfterCancel).toEqual(
			workflowSubscriptionItemIdsBeforeCancel,
		);

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		const customerAfterRenewal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerInvoiceCorrect({
			customer: customerAfterRenewal,
			count: 2,
			latestTotal: 10,
		});

		const fullCustomerAfterRenewal = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const activeCreditCustomerProducts = getCustomerProductsByProductId({
			fullCustomer: fullCustomerAfterRenewal,
			productId: prepaidCreditsAddon.id,
		}).filter(
			(customerProduct) =>
				customerProduct.status === CusProductStatus.Active &&
				!customerProduct.canceled_at,
		);
		const activeWorkflowCustomerProducts = getCustomerProductsByProductId({
			fullCustomer: fullCustomerAfterRenewal,
			productId: prepaidWorkflowsAddon.id,
		}).filter(
			(customerProduct) =>
				customerProduct.status === CusProductStatus.Active &&
				!customerProduct.canceled_at,
		);

		expect(activeCreditCustomerProducts).toHaveLength(1);
		expect(activeWorkflowCustomerProducts).toHaveLength(2);
	},
);

test.concurrent(
	`${chalk.yellowBright("multi-attach scheduled cancel: cancel one annual prepaid add-on keeps monthly prepaid renewal clean")}`,
	async () => {
		const customerId = "multi-attach-annual-prepaid-cancel-renewal";
		const packQuantity = 100;

		const prepaidCreditsAddon = createPrepaidAddon({
			id: "prepaid-credits-annual-cancel",
			featureId: TestFeature.Credits,
		});
		const prepaidWorkflowsAddon = createPrepaidAddon({
			id: "prepaid-workflows-annual-cancel",
			featureId: TestFeature.Workflows,
			interval: ProductItemInterval.Year,
		});

		const { autumnV1, ctx, testClockId } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [prepaidCreditsAddon, prepaidWorkflowsAddon] }),
			],
			actions: [
				s.billing.multiAttach({
					plans: [
						{
							productId: prepaidCreditsAddon.id,
							featureQuantities: [
								{ feature_id: TestFeature.Credits, quantity: packQuantity },
							],
						},
						{
							productId: prepaidCreditsAddon.id,
							featureQuantities: [
								{ feature_id: TestFeature.Credits, quantity: packQuantity },
							],
						},
						{
							productId: prepaidWorkflowsAddon.id,
							featureQuantities: [
								{ feature_id: TestFeature.Workflows, quantity: packQuantity },
							],
						},
						{
							productId: prepaidWorkflowsAddon.id,
							featureQuantities: [
								{ feature_id: TestFeature.Workflows, quantity: packQuantity },
							],
						},
					],
				}),
			],
		});

		const fullCustomerBeforeCancel = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const workflowCustomerProducts = getCustomerProductsByProductId({
			fullCustomer: fullCustomerBeforeCancel,
			productId: prepaidWorkflowsAddon.id,
		});
		expect(workflowCustomerProducts).toHaveLength(2);

		const creditCustomerPriceIds = new Set(
			getCustomerProductsByProductId({
				fullCustomer: fullCustomerBeforeCancel,
				productId: prepaidCreditsAddon.id,
			}).flatMap((customerProduct) =>
				customerProduct.customer_prices.map(
					(customerPrice) => customerPrice.id,
				),
			),
		);
		const stripeSubscriptionId = getFirstSubscriptionId({
			subscriptionIds: workflowCustomerProducts[0]!.subscription_ids,
			productId: prepaidWorkflowsAddon.id,
		});
		const subscriptionBeforeCancel =
			await ctx.stripeCli.subscriptions.retrieve(stripeSubscriptionId);
		const creditSubscriptionItemIdsBeforeCancel =
			subscriptionBeforeCancel.items.data
				.filter((item) =>
					creditCustomerPriceIds.has(item.metadata.autumn_customer_price_id),
				)
				.map((item) => item.id)
				.sort();

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			customer_product_id: workflowCustomerProducts[0]!.id,
			cancel_action: "cancel_end_of_cycle" as const,
		});

		const subscriptionAfterCancel =
			await ctx.stripeCli.subscriptions.retrieve(stripeSubscriptionId);
		const creditSubscriptionItemIdsAfterCancel =
			subscriptionAfterCancel.items.data
				.filter((item) =>
					creditCustomerPriceIds.has(item.metadata.autumn_customer_price_id),
				)
				.map((item) => item.id)
				.sort();

		expect(creditSubscriptionItemIdsAfterCancel).toEqual(
			creditSubscriptionItemIdsBeforeCancel,
		);

		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});

		const customerAfterRenewal =
			await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerInvoiceCorrect({
			customer: customerAfterRenewal,
			count: 2,
			latestTotal: 20,
		});
	},
);
