import { expect, test } from "bun:test";
import { products as productsTable } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
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

test.concurrent(`${chalk.yellowBright("migrations prepare runtime: variant plan reuses its BASE plan's Stripe resources")}`, async () => {
	const baseCustomerId = "prep-base-variant-reuse-base";
	const variantCustomerId = "prep-base-variant-reuse-variant";

	const pro = products.pro({ id: "pro", items: [] });
	const proYearly = products.pro({ id: "pro_yearly", items: [] });

	const { autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId: baseCustomerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.otherCustomers([{ id: variantCustomerId, paymentMethod: "success" }]),
			s.products({ list: [pro, proYearly] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.billing.attach({ productId: proYearly.id, customerId: variantCustomerId }),
		],
	});

	await ctx.db
		.update(productsTable)
		.set({ base_variant_id: pro.id })
		.where(
			and(
				eq(productsTable.id, proYearly.id),
				eq(productsTable.org_id, ctx.org.id),
				eq(productsTable.env, ctx.env),
			),
		);

	await autumnV1.products.update(pro.id, {
		items: [
			items.volumePrepaidMessages({
				includedUsage: 0,
				tiers: [
					{ to: 2000, amount: 30 },
					{ to: "inf", amount: 12 },
				],
			}),
		],
	});

	const latestProVersion = await ctx.db.query.products.findFirst({
		where: (p, { eq: eqOp, and: andOp }) =>
			andOp(eqOp(p.id, pro.id), eqOp(p.org_id, ctx.org.id), eqOp(p.env, ctx.env)),
		orderBy: (p, { desc }) => desc(p.version),
	});
	if (!latestProVersion) {
		throw new Error("Expected pro's latest version to exist");
	}
	const proNonCustomPrices = await ctx.db.query.prices.findMany({
		where: (p, { eq: eqOp, and: andOp }) =>
			andOp(
				eqOp(p.internal_product_id, latestProVersion.internal_id),
				eqOp(p.is_custom, false),
			),
	});
	const preSeededPro = proNonCustomPrices.find(
		(p) => (p.config as { type?: string }).type === "usage",
	);
	if (!preSeededPro?.config) {
		throw new Error("Expected pre-seeded pro price to exist");
	}
	const preSeededConfig = preSeededPro.config as PriceStripeConfig;
	if (
		!preSeededConfig.stripe_product_id ||
		!preSeededConfig.stripe_prepaid_price_v2_id
	) {
		throw new Error("Expected pre-seeded pro price to have real Stripe ids");
	}

	const operations = buildUpdatePlanOperations({
		planId: proYearly.id,
		customize: {
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
		id: `${variantCustomerId}-mig`,
		filter: { customer: { plan: { plan_id: proYearly.id } } },
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

	const variantConfig = run.result.prices.find((p) => p.id === priceId)
		?.config as PriceStripeConfig | undefined;

	expect(variantConfig?.stripe_product_id).toBe(preSeededConfig.stripe_product_id);
	expect(variantConfig?.stripe_prepaid_price_v2_id).toBe(
		preSeededConfig.stripe_prepaid_price_v2_id,
	);
});
