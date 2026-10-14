import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { buildUpdatePlanOperations, createMigration } from "../../utils/migrationTestUtils.js";
import {
	expectPreparedArtifact,
	expectPreparedArtifactRowIds,
	prepareMigration,
} from "./utils/ensurePrepareTestUtils.js";

type PriceStripeConfig = {
	stripe_product_id?: string | null;
	stripe_prepaid_price_v2_id?: string | null;
};

test.concurrent(`${chalk.yellowBright("migrations prepare runtime: reuse picks the right price when a feature has more than one")}`, async () => {
	const customerId = "prep-multi-price-feature-reuse";

	const pro = products.pro({
		id: "pro",
		items: [
			items.consumableMessages({ price: 0.05 }),
			items.volumePrepaidMessages({
				includedUsage: 0,
				tiers: [
					{ to: 2000, amount: 30 },
					{ to: "inf", amount: 12 },
				],
			}),
		],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ paymentMethod: "success" }), s.products({ list: [pro] })],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const preSeededPrices = await ctx.db.query.products
		.findFirst({
			where: (p, { eq, and }) =>
				and(eq(p.id, pro.id), eq(p.org_id, ctx.org.id), eq(p.env, ctx.env)),
			with: { prices: true },
		})
		.then((product) => product?.prices ?? []);
	const preSeededPrepaid = preSeededPrices.find(
		(p) => (p.config as { type?: string }).type === "usage" && p.tier_behavior === "volume",
	);
	if (!preSeededPrepaid) {
		throw new Error("Expected pre-seeded prepaid price to exist");
	}
	const preSeededConfig = preSeededPrepaid.config as PriceStripeConfig;
	if (
		!preSeededConfig.stripe_product_id ||
		!preSeededConfig.stripe_prepaid_price_v2_id
	) {
		throw new Error("Expected pre-seeded prepaid price to have real Stripe ids");
	}

	const operations = buildUpdatePlanOperations({
		planId: pro.id,
		customize: {
			remove_items: [{ feature_id: TestFeature.Messages }],
			add_items: [
				itemsV2.volumePrepaidMessages({
					included: 0,
					tiers: [
						{ to: 2000, amount: 30 },
						{ to: "inf", amount: 12 },
					],
				}),
			],
		},
	});
	const migration = await createMigration({
		migrationClient: autumnV2_2,
		id: `${customerId}-mig`,
		filter: { customer: { plan: { plan_id: pro.id } } },
		operations,
	});

	const run = await prepareMigration({ ctx, migration, dryRun: false });
	const artifact = expectPreparedArtifact({
		result: run,
		opIndex: 0,
		kind: "add_item",
		itemIndex: 0,
	});
	const { priceId } = expectPreparedArtifactRowIds({ artifact });

	const migratedConfig = run.result.prices.find((p) => p.id === priceId)
		?.config as PriceStripeConfig | undefined;

	expect(migratedConfig?.stripe_product_id).toBe(preSeededConfig.stripe_product_id);
	expect(migratedConfig?.stripe_prepaid_price_v2_id).toBe(
		preSeededConfig.stripe_prepaid_price_v2_id,
	);
});
