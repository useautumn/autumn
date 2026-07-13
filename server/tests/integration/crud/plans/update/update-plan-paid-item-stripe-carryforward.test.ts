import { expect, test } from "bun:test";
import {
	ApiVersion,
	BillingVersion,
	CollectionMethod,
	CusProductStatus,
	findPriceByFeatureId,
	type FullProduct,
	type Price,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import { generateId } from "@/utils/genUtils.js";

type PriceConfigWithStripeResources = {
	stripe_product_id?: string | null;
	stripe_price_id?: string | null;
	stripe_prepaid_price_v2_id?: string | null;
};

const stripeProductId = ({ label }: { label: string }) => `prod_${label}`;
const stripePriceId = ({ label }: { label: string }) => `price_${label}`;
const stripePrepaidPriceId = ({ label }: { label: string }) =>
	`price_prepaid_${label}`;

const getPlan = async ({
	ctx,
	planId,
	version,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	planId: string;
	version?: number;
}) =>
	ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});

const getPaidMessagesPrice = ({ product }: { product: FullProduct }): Price => {
	const price = findPriceByFeatureId({
		prices: product.prices,
		featureId: TestFeature.Messages,
	});
	if (!price) throw new Error("Expected paid messages price");
	return price;
};

const seedPaidMessagesStripeResources = async ({
	ctx,
	product,
	stripeProductId,
	stripePriceId,
	stripePrepaidPriceId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	product: FullProduct;
	stripeProductId: string;
	stripePriceId?: string;
	stripePrepaidPriceId?: string;
}) => {
	const price = getPaidMessagesPrice({ product });
	await PriceService.update({
		db: ctx.db,
		id: price.id,
		update: {
			config: ({
				...price.config,
				stripe_product_id: stripeProductId,
				stripe_price_id: stripePriceId,
				stripe_prepaid_price_v2_id: stripePrepaidPriceId,
			}) as Price["config"],
		},
	});
};

const getPaidMessagesStripeConfig = async ({
	ctx,
	planId,
	version,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	planId: string;
	version?: number;
}) => {
	const product = await getPlan({ ctx, planId, version });
	const price = getPaidMessagesPrice({ product });
	return price.config as PriceConfigWithStripeResources;
};

const insertCustomerProductForPlan = async ({
	ctx,
	customerId,
	internalCustomerId,
	product,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customerId: string;
	internalCustomerId: string;
	product: FullProduct;
}) => {
	const now = Date.now();
	await CusProductService.insert({
		db: ctx.db,
		data: {
			id: generateId("cus_prod"),
			internal_customer_id: internalCustomerId,
			internal_product_id: product.internal_id,
			internal_entity_id: null,
			created_at: now,
			updated_at: now,
			status: CusProductStatus.Active,
			processor: undefined,
			canceled: false,
			canceled_at: null,
			ended_at: null,
			starts_at: now,
			access_starts_at: null,
			options: [],
			product_id: product.id,
			free_trial_id: null,
			trial_ends_at: null,
			billing_cycle_anchor: null,
			billing_cycle_anchor_resets_at: null,
			collection_method: CollectionMethod.ChargeAutomatically,
			subscription_ids: [],
			scheduled_ids: [],
			quantity: 1,
			is_custom: false,
			customer_id: customerId,
			entity_id: null,
			billing_version: BillingVersion.V2,
			api_semver: null,
			external_id: null,
			stripe_checkout_session_id: null,
			previous_customer_product_id: null,
			on_trial_end: null,
		},
	});
};

const setupCatalogUpdateCase = async ({ id }: { id: string }) => {
	const plan = products.base({
		id: "pro",
		items: [items.prepaidMessages({ price: 3 })],
	});
	const { autumnV2_2, customer, ctx } = await initScenario({
		customerId: id,
		setup: [
			s.platform.create({
				slug: `${id}-${Math.random().toString(36).slice(2, 8)}`,
				configOverrides: { disable_stripe_writes: true },
				setupDefaultFeatures: true,
			}),
			s.customer({ testClock: false }),
			s.products({ list: [plan], createInStripe: false }),
		],
		actions: [],
	});
	const rpc = new AutumnRpcCli({
		secretKey: ctx.orgSecretKey,
		version: ApiVersion.V2_1,
	});
	const product = await getPlan({ ctx, planId: plan.id });

	await insertCustomerProductForPlan({
		ctx,
		customerId: id,
		internalCustomerId: customer.internal_id,
		product,
	});

	return { autumnV2_2, customer, ctx, plan, product, rpc };
};

test.concurrent(
	`${chalk.yellowBright("plans.update: new version carries paid item stripe_product_id")}`,
	async () => {
		const id = "plan-paid-stripe-new-version";
		const { ctx, plan, product, rpc } = await setupCatalogUpdateCase({ id });
		const sourceStripeProductId = stripeProductId({ label: `${id}_v1` });
		const sourceStripePriceId = stripePriceId({ label: `${id}_v1` });
		const sourceStripePrepaidPriceId = stripePrepaidPriceId({
			label: `${id}_v1`,
		});
		await seedPaidMessagesStripeResources({
			ctx,
			product,
			stripeProductId: sourceStripeProductId,
			stripePriceId: sourceStripePriceId,
			stripePrepaidPriceId: sourceStripePrepaidPriceId,
		});

		await rpc.plans.update(plan.id, {
			items: [itemsV2.prepaidMessages({ amount: 6 })],
		});

		const config = await getPaidMessagesStripeConfig({
			ctx,
			planId: plan.id,
			version: 2,
		});
		expect(config.stripe_product_id).toBe(sourceStripeProductId);
		expect(config.stripe_price_id).not.toBe(sourceStripePriceId);
		expect(config.stripe_prepaid_price_v2_id).not.toBe(
			sourceStripePrepaidPriceId,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("plans.update: new version carries full stripe price ids when paid item matches")}`,
	async () => {
		const id = "plan-paid-stripe-new-version-full";
		const { ctx, plan, product, rpc } = await setupCatalogUpdateCase({ id });
		const sourceStripeProductId = stripeProductId({ label: `${id}_v1` });
		const sourceStripePriceId = stripePriceId({ label: `${id}_v1` });
		const sourceStripePrepaidPriceId = stripePrepaidPriceId({
			label: `${id}_v1`,
		});
		await seedPaidMessagesStripeResources({
			ctx,
			product,
			stripeProductId: sourceStripeProductId,
			stripePriceId: sourceStripePriceId,
			stripePrepaidPriceId: sourceStripePrepaidPriceId,
		});

		await rpc.plans.update(plan.id, {
			force_version: true,
			items: [itemsV2.prepaidMessages({ amount: 3 })],
		});

		const config = await getPaidMessagesStripeConfig({
			ctx,
			planId: plan.id,
			version: 2,
		});
		expect(config.stripe_product_id).toBe(sourceStripeProductId);
		expect(config.stripe_price_id).toBe(sourceStripePriceId);
		expect(config.stripe_prepaid_price_v2_id).toBe(sourceStripePrepaidPriceId);
	},
);

test.concurrent(
	`${chalk.yellowBright("plans.update: in-place update carries paid item stripe_product_id")}`,
	async () => {
		const id = "plan-paid-stripe-in-place";
		const { ctx, plan, product, rpc } = await setupCatalogUpdateCase({ id });
		const sourceStripeProductId = stripeProductId({ label: `${id}_v1` });
		await seedPaidMessagesStripeResources({
			ctx,
			product,
			stripeProductId: sourceStripeProductId,
		});

		await rpc.plans.update(plan.id, {
			disable_version: true,
			items: [itemsV2.prepaidMessages({ amount: 6 })],
		});

		const config = await getPaidMessagesStripeConfig({
			ctx,
			planId: plan.id,
		});
		expect(config.stripe_product_id).toBe(sourceStripeProductId);
	},
);

test.concurrent(
	`${chalk.yellowBright("plans.update: all_versions carries each paid item stripe_product_id")}`,
	async () => {
		const id = "plan-paid-stripe-all-versions";
		const { customer, ctx, plan, product, rpc } =
			await setupCatalogUpdateCase({ id });
		const versionOneStripeProductId = stripeProductId({ label: `${id}_v1` });
		await seedPaidMessagesStripeResources({
			ctx,
			product,
			stripeProductId: versionOneStripeProductId,
		});

		await rpc.plans.update(plan.id, {
			items: [itemsV2.prepaidMessages({ amount: 6 })],
		});
		const versionTwoProduct = await getPlan({ ctx, planId: plan.id, version: 2 });
		const versionTwoStripeProductId = stripeProductId({ label: `${id}_v2` });
		await seedPaidMessagesStripeResources({
			ctx,
			product: versionTwoProduct,
			stripeProductId: versionTwoStripeProductId,
		});
		await insertCustomerProductForPlan({
			ctx,
			customerId: id,
			internalCustomerId: customer.internal_id,
			product: versionTwoProduct,
		});

		await rpc.plans.update(plan.id, {
			all_versions: true,
			items: [itemsV2.prepaidMessages({ amount: 9 })],
		});

		const versionOneConfig = await getPaidMessagesStripeConfig({
			ctx,
			planId: plan.id,
			version: 1,
		});
		const versionTwoConfig = await getPaidMessagesStripeConfig({
			ctx,
			planId: plan.id,
			version: 2,
		});
		expect(versionOneConfig.stripe_product_id).toBe(versionOneStripeProductId);
		expect(versionTwoConfig.stripe_product_id).toBe(versionTwoStripeProductId);
	},
);
