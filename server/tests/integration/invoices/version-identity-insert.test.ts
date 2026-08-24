/**
 * invoices.insert — omit-version plan_ids resolve to the active product row.
 *
 * Contract:
 *   v2 active (lockstep) → internal_product_ids is v2
 *   v1 forced active → internal_product_ids is v1
 */

import { expect, test } from "bun:test";
import { invoices } from "@autumn/shared";
import { forceActiveVersion } from "@tests/integration/utils/forceActiveVersion.js";
import { items } from "@tests/utils/fixtures/items";
import { products as productFixtures } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { ProductService } from "@/internal/products/ProductService.js";

const internalIdForVersion = async ({
	ctx,
	planId,
	version,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	planId: string;
	version: number;
}) => {
	const product = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});
	return product.internal_id;
};

test.concurrent(
	`${chalk.yellowBright("version identity invoices.insert: v2 active stamps v2 internal_id")}`,
	async () => {
		const customerId = "vid-inv-lockstep";
		const stripeId = `in_vid_lockstep_${Date.now()}`;
		const pro = productFixtures.pro({
			id: "vid-inv-lockstep-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await autumnV2_3.catalogV2.update({
			plans: [{ plan_id: pro.id, versioning: "new_version", active: true }],
		});

		await autumnV2_3.post("/invoices.insert", {
			invoices: [
				{
					customer_id: customerId,
					plan_ids: [pro.id],
					stripe_id: stripeId,
					processor_type: "stripe",
					status: "paid",
					total: 20,
					created_at: Date.UTC(2016, 0, 1),
				},
			],
		});

		const stored = await ctx.db.query.invoices.findFirst({
			where: eq(invoices.stripe_id, stripeId),
		});
		expect(stored?.internal_product_ids).toEqual([
			await internalIdForVersion({ ctx, planId: pro.id, version: 2 }),
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity invoices.insert: v1 forced active stamps v1 internal_id")}`,
	async () => {
		const customerId = "vid-inv-active";
		const stripeId = `in_vid_active_${Date.now()}`;
		const pro = productFixtures.pro({
			id: "vid-inv-active-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await autumnV2_3.catalogV2.update({
			plans: [{ plan_id: pro.id, versioning: "new_version", active: true }],
		});
		await forceActiveVersion({ ctx, planId: pro.id, version: 1 });

		await autumnV2_3.post("/invoices.insert", {
			invoices: [
				{
					customer_id: customerId,
					plan_ids: [pro.id],
					stripe_id: stripeId,
					processor_type: "stripe",
					status: "paid",
					total: 20,
					created_at: Date.UTC(2016, 0, 1),
				},
			],
		});

		const stored = await ctx.db.query.invoices.findFirst({
			where: eq(invoices.stripe_id, stripeId),
		});
		expect(stored?.internal_product_ids).toEqual([
			await internalIdForVersion({ ctx, planId: pro.id, version: 1 }),
		]);
	},
);
