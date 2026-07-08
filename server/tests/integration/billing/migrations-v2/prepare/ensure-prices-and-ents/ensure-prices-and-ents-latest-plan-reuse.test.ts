import { expect, test } from "bun:test";
import {
	ApiVersion,
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
import { ProductService } from "@/internal/products/ProductService.js";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import {
	buildUpdatePlanOperations,
	createMigration,
} from "../../utils/migrationTestUtils.js";
import {
	expectPreparedArtifact,
	expectPreparedArtifactRowIds,
	prepareMigration,
} from "./utils/ensurePrepareTestUtils.js";

type PriceConfigWithStripeProduct = {
	stripe_product_id?: string | null;
};

const getPlan = ({
	ctx,
	planId,
	version,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	planId: string;
	version: number;
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

const seedPaidMessagesStripeProduct = async ({
	ctx,
	product,
	stripeProductId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	product: FullProduct;
	stripeProductId: string;
}) => {
	const price = getPaidMessagesPrice({ product });
	await PriceService.update({
		db: ctx.db,
		id: price.id,
		update: {
			config: {
				...price.config,
				stripe_product_id: stripeProductId,
			},
		},
	});
};

test.concurrent(
	`${chalk.yellowBright("migrations prepare: paid replacement reuses latest targeted plan stripe_product_id")}`,
	async () => {
		const id = "prep-latest-plan-paid-stripe";
		const plan = products.base({
			id: "pro",
			items: [items.prepaidMessages({ price: 3 })],
		});
		const { autumnV2_2, ctx } = await initScenario({
			setup: [
				s.platform.create({
					slug: `${id}-${Math.random().toString(36).slice(2, 8)}`,
					configOverrides: { disable_stripe_writes: true },
					setupDefaultFeatures: true,
				}),
				s.products({ list: [plan], createInStripe: false }),
			],
			actions: [],
		});
		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});

		await rpc.plans.update(plan.id, {
			force_version: true,
			items: [itemsV2.prepaidMessages({ amount: 6 })],
		});
		const versionOne = await getPlan({ ctx, planId: plan.id, version: 1 });
		const versionTwo = await getPlan({ ctx, planId: plan.id, version: 2 });
		await seedPaidMessagesStripeProduct({
			ctx,
			product: versionOne,
			stripeProductId: "prod_old_version_messages",
		});
		await seedPaidMessagesStripeProduct({
			ctx,
			product: versionTwo,
			stripeProductId: "prod_latest_version_messages",
		});

		const migration = await createMigration({
			migrationClient: autumnV2_2,
			id,
			filter: { customer: { plan: { plan_id: plan.id } } },
			operations: buildUpdatePlanOperations({
				planId: plan.id,
				customize: {
					remove_items: [{ feature_id: TestFeature.Messages }],
					add_items: [itemsV2.prepaidMessages({ amount: 9 })],
				},
			}),
		});
		const prepared = await prepareMigration({ ctx, migration, dryRun: true });
		const oldVersionArtifact = expectPreparedArtifact({
			result: prepared,
			opIndex: 0,
			kind: "add_item",
			itemIndex: 0,
			internalProductId: versionOne.internal_id,
		});
		const { priceId } = expectPreparedArtifactRowIds({
			artifact: oldVersionArtifact,
		});
		const preparedPrice = prepared.result.prices.find(
			(price) => price.id === priceId,
		);

		expect(
			(preparedPrice?.config as PriceConfigWithStripeProduct | undefined)
				?.stripe_product_id,
		).toBe("prod_latest_version_messages");
	},
);
