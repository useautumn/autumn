import { test } from "bun:test";
import {
	type AttachParamsV1Input,
	BillingInterval,
	BillingMethod,
	RolloverExpiryDurationType,
	TierBehavior,
	TierInfinite,
} from "@autumn/shared";
import {
	expectAllStripeIdsReused,
	expectStripePriceIdNotReused,
	loadCustomerAndCatalogPrices,
} from "@tests/integration/billing/misc/utils/findCatalogAndCustomPrices";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("custom plan: add boolean entitlement → base price Stripe IDs reused")}`,
	async () => {
		const customerId = "reuse-custom-boolean";

		const proPlan = products.pro({
			id: "pro-reuse-boolean",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [proPlan] }),
			],
			actions: [],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: proPlan.id,
			customize: {
				price: itemsV2.monthlyPrice({ amount: 20 }),
				items: [
					itemsV2.monthlyMessages({ included: 100 }),
					itemsV2.dashboard(),
				],
			},
		};

		await autumnV2_2.billing.attach<AttachParamsV1Input>(params);

		const { pairs, catalogProduct } = await loadCustomerAndCatalogPrices({
			ctx,
			customerId,
			catalogProductId: proPlan.id,
		});

		expectAllStripeIdsReused({ pairs, catalogProduct });
	},
);

test.concurrent(
	`${chalk.yellowBright("custom plan: paid feature shapes unchanged → all Stripe IDs reused")}`,
	async () => {
		const customerId = "reuse-custom-paid";

		const proPlan = products.pro({
			id: "pro-reuse-paid",
			items: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.prepaidUsers({ billingUnits: 1 }),
				items.consumableWords({ includedUsage: 0 }),
				items.allocatedV2Workflows({ includedUsage: 0 }),
			],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [proPlan] }),
			],
			actions: [],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: proPlan.id,
			customize: {
				price: itemsV2.monthlyPrice({ amount: 20 }),
				items: [
					itemsV2.monthlyMessages({ included: 100 }),
					itemsV2.prepaidUsers({ amount: 10, billingUnits: 1 }),
					itemsV2.consumableWords({ amount: 0.05 }),
					itemsV2.allocatedWorkflows({ amount: 10 }),
					itemsV2.dashboard(),
				],
			},
		};

		await autumnV2_2.billing.attach<AttachParamsV1Input>(params);

		const { pairs, catalogProduct } = await loadCustomerAndCatalogPrices({
			ctx,
			customerId,
			catalogProductId: proPlan.id,
		});

		expectAllStripeIdsReused({ pairs, catalogProduct });
	},
);

test.concurrent(
	`${chalk.yellowBright("custom plan: prepaid → consumable on same feature → stripe_price_id NOT reused")}`,
	async () => {
		const customerId = "reuse-custom-prepaid-to-consumable";

		const proPlan = products.pro({
			id: "pro-reuse-prepaid-to-consumable",
			items: [items.prepaidMessages({ includedUsage: 0 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [proPlan] }),
			],
			actions: [],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: proPlan.id,
			customize: {
				price: itemsV2.monthlyPrice({ amount: 20 }),
				items: [itemsV2.consumableMessages({ amount: 0.5 })],
			},
		};

		await autumnV2_2.billing.attach<AttachParamsV1Input>(params);

		const { pairs, catalogProduct, catalogPrices, customerPrices } =
			await loadCustomerAndCatalogPrices({
				ctx,
				customerId,
				catalogProductId: proPlan.id,
			});

		expectStripePriceIdNotReused({
			pairs,
			catalogProduct,
			featureId: TestFeature.Messages,
			catalogPrices,
			customerPrices,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("custom plan: prepaid amount change → stripe_price_id NOT reused")}`,
	async () => {
		const customerId = "reuse-custom-prepaid-amount";

		const proPlan = products.pro({
			id: "pro-reuse-prepaid-amount",
			items: [items.prepaidMessages({ includedUsage: 0 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [proPlan] }),
			],
			actions: [],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: proPlan.id,
			customize: {
				price: itemsV2.monthlyPrice({ amount: 20 }),
				items: [itemsV2.prepaidMessages({ amount: 25, billingUnits: 100 })],
			},
		};

		await autumnV2_2.billing.attach<AttachParamsV1Input>(params);

		const { pairs, catalogProduct } = await loadCustomerAndCatalogPrices({
			ctx,
			customerId,
			catalogProductId: proPlan.id,
		});

		expectStripePriceIdNotReused({
			pairs,
			catalogProduct,
			featureId: TestFeature.Messages,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("custom plan: tier amount change → stripe_price_id NOT reused")}`,
	async () => {
		const customerId = "reuse-custom-tier";

		const proPlan = products.pro({
			id: "pro-reuse-tier",
			items: [items.tieredPrepaidMessages({ includedUsage: 0 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [proPlan] }),
			],
			actions: [],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: proPlan.id,
			customize: {
				price: itemsV2.monthlyPrice({ amount: 20 }),
				items: [
					itemsV2.tieredPrepaidMessages({
						tiers: [
							{ to: 600, amount: 20 },
							{ to: TierInfinite, amount: 10 },
						],
					}),
				],
			},
		};

		await autumnV2_2.billing.attach<AttachParamsV1Input>(params);

		const { pairs, catalogProduct } = await loadCustomerAndCatalogPrices({
			ctx,
			customerId,
			catalogProductId: proPlan.id,
		});

		expectStripePriceIdNotReused({
			pairs,
			catalogProduct,
			featureId: TestFeature.Messages,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("custom plan: graduated → volume tier_behavior → stripe_price_id NOT reused")}`,
	async () => {
		const customerId = "reuse-custom-tier-behavior";

		const proPlan = products.pro({
			id: "pro-reuse-tier-behavior",
			items: [items.tieredPrepaidMessages({ includedUsage: 0 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [proPlan] }),
			],
			actions: [],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: proPlan.id,
			customize: {
				price: itemsV2.monthlyPrice({ amount: 20 }),
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 0,
						price: {
							tiers: [
								{ to: 500, amount: 10 },
								{ to: TierInfinite, amount: 5 },
							],
							tier_behavior: TierBehavior.VolumeBased,
							interval: BillingInterval.Month,
							billing_method: BillingMethod.Prepaid,
							billing_units: 100,
						},
					},
				],
			},
		};

		await autumnV2_2.billing.attach<AttachParamsV1Input>(params);

		const { pairs, catalogProduct } = await loadCustomerAndCatalogPrices({
			ctx,
			customerId,
			catalogProductId: proPlan.id,
		});

		expectStripePriceIdNotReused({
			pairs,
			catalogProduct,
			featureId: TestFeature.Messages,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("custom plan: add flat_amount to tier → stripe_price_id NOT reused")}`,
	async () => {
		const customerId = "reuse-custom-flat-amount";

		const proPlan = products.pro({
			id: "pro-reuse-flat-amount",
			items: [items.volumePrepaidMessages({ includedUsage: 0 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [proPlan] }),
			],
			actions: [],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: proPlan.id,
			customize: {
				price: itemsV2.monthlyPrice({ amount: 20 }),
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 0,
						price: {
							tiers: [
								{ to: 500, amount: 10, flat_amount: 100 },
								{ to: TierInfinite, amount: 5 },
							],
							tier_behavior: TierBehavior.VolumeBased,
							interval: BillingInterval.Month,
							billing_method: BillingMethod.Prepaid,
							billing_units: 100,
						},
					},
				],
			},
		};

		await autumnV2_2.billing.attach<AttachParamsV1Input>(params);

		const { pairs, catalogProduct } = await loadCustomerAndCatalogPrices({
			ctx,
			customerId,
			catalogProductId: proPlan.id,
		});

		expectStripePriceIdNotReused({
			pairs,
			catalogProduct,
			featureId: TestFeature.Messages,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("custom plan: prorated allocated → arrear customize → stripe_price_id NOT reused")}`,
	async () => {
		const customerId = "reuse-custom-proration";

		const proPlan = products.pro({
			id: "pro-reuse-proration",
			items: [items.allocatedWorkflows({ includedUsage: 0 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [proPlan] }),
			],
			actions: [],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: proPlan.id,
			customize: {
				price: itemsV2.monthlyPrice({ amount: 20 }),
				items: [itemsV2.allocatedWorkflows({ amount: 10 })],
			},
		};

		await autumnV2_2.billing.attach<AttachParamsV1Input>(params);

		const { pairs, catalogProduct } = await loadCustomerAndCatalogPrices({
			ctx,
			customerId,
			catalogProductId: proPlan.id,
		});

		expectStripePriceIdNotReused({
			pairs,
			catalogProduct,
			featureId: TestFeature.Workflows,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("custom plan: change prepaid billing_units → stripe_price_id NOT reused")}`,
	async () => {
		const customerId = "reuse-custom-billing-units";

		const proPlan = products.pro({
			id: "pro-reuse-billing-units",
			items: [items.prepaidMessages({ includedUsage: 0, billingUnits: 100 })],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [proPlan] }),
			],
			actions: [],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: proPlan.id,
			customize: {
				price: itemsV2.monthlyPrice({ amount: 20 }),
				items: [itemsV2.prepaidMessages({ amount: 10, billingUnits: 50 })],
			},
		};

		await autumnV2_2.billing.attach<AttachParamsV1Input>(params);

		const { pairs, catalogProduct } = await loadCustomerAndCatalogPrices({
			ctx,
			customerId,
			catalogProductId: proPlan.id,
		});

		expectStripePriceIdNotReused({
			pairs,
			catalogProduct,
			featureId: TestFeature.Messages,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("custom plan: change rollover config → base price Stripe IDs still reused")}`,
	async () => {
		const customerId = "reuse-custom-rollover";

		const proPlan = products.pro({
			id: "pro-reuse-rollover",
			items: [
				items.monthlyMessagesWithRollover({
					includedUsage: 200,
					rolloverConfig: {
						max: 100,
						length: 0,
						duration: RolloverExpiryDurationType.Forever,
					},
				}),
			],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [proPlan] }),
			],
			actions: [],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: proPlan.id,
			customize: {
				price: itemsV2.monthlyPrice({ amount: 20 }),
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 200,
						rollover: {
							max: 500,
							expiry_duration_type: RolloverExpiryDurationType.Forever,
							expiry_duration_length: 0,
						},
					},
				],
			},
		};

		await autumnV2_2.billing.attach<AttachParamsV1Input>(params);

		const { pairs, catalogProduct } = await loadCustomerAndCatalogPrices({
			ctx,
			customerId,
			catalogProductId: proPlan.id,
		});

		expectAllStripeIdsReused({ pairs, catalogProduct });
	},
);

test.concurrent(
	`${chalk.yellowBright("custom plan: prepaid + consumable pair on same feature → both Stripe IDs reused")}`,
	async () => {
		const customerId = "reuse-custom-pair";

		const proPlan = products.pro({
			id: "pro-reuse-pair",
			items: [
				items.prepaidMessages({ includedUsage: 0, billingUnits: 100 }),
				items.consumableMessages({ includedUsage: 0, price: 0.5 }),
			],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [proPlan] }),
			],
			actions: [],
		});

		const params: AttachParamsV1Input = {
			customer_id: customerId,
			plan_id: proPlan.id,
			customize: {
				price: itemsV2.monthlyPrice({ amount: 20 }),
				items: [
					itemsV2.prepaidMessages({ amount: 10, billingUnits: 100 }),
					itemsV2.consumableMessages({ amount: 0.5 }),
					itemsV2.dashboard(),
				],
			},
		};

		await autumnV2_2.billing.attach<AttachParamsV1Input>(params);

		const { pairs, catalogProduct } = await loadCustomerAndCatalogPrices({
			ctx,
			customerId,
			catalogProductId: proPlan.id,
		});

		expectAllStripeIdsReused({ pairs, catalogProduct });
	},
);
