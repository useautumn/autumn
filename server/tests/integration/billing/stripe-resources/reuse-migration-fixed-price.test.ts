/**
 * In-place catalog $20 → $40 then migrate attached customers.
 *
 * Contract:
 *   A+B on $20 → catalog $40 → migrate both → same $40 stripe_price_id,
 *     not the retired $20 id
 *   A already $40 custom, B still $20 → catalog $40 → migrate → B uses
 *     one live $40 (A's or catalog's), not a third mint
 */

import { expect, test } from "bun:test";
import type {
	AttachParamsV1Input,
	UpdatePlanParamsV2Input,
} from "@autumn/shared";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { runMigrationInChunks } from "@/internal/migrations/v2/run/runMigrationInChunks.js";
import { generateId } from "@/utils/genUtils.js";
import { customerFixedStripePriceId } from "./utils/customerFixedStripePriceId";

const updatePlanPriceInPlace = async ({
	autumn,
	planId,
	amount,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	planId: string;
	amount: number;
}) => {
	const body: UpdatePlanParamsV2Input = {
		plan_id: planId,
		disable_version: true,
		migration: { draft: true },
		price: itemsV2.monthlyPrice({ amount }),
	};
	const response = (await autumn.post("/plans.update", body)) as {
		migration?: { id: string };
		migrations?: { id: string }[];
	};
	const migrationId = response.migrations?.[0]?.id ?? response.migration?.id;
	if (!migrationId) throw new Error(`expected a catalog draft for ${planId}`);
	return migrationId;
};

const runCatalogDraft = async ({
	ctx,
	migrationId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	migrationId: string;
}) => {
	const [migration] = await migrationRepo.get({ ctx, id: migrationId });
	if (!migration) throw new Error(`Migration ${migrationId} not found`);
	await runMigrationInChunks({
		ctx,
		migration,
		migrationRunId: generateId("mrun"),
		dryRun: false,
	});
};

test.concurrent(
	`${chalk.yellowBright("reuse migrate fixed: A+B $20 → catalog $40 share one Stripe Price")}`,
	async () => {
		const customerBId = "reuse-mig-b-both";
		const pro = products.pro({ id: "reuse-mig-ab-both", items: [] });

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "reuse-mig-a-both",
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.otherCustomers([{ id: customerBId, paymentMethod: "success" }]),
			],
			actions: [
				s.parallel(
					s.billing.attach({ productId: pro.id }),
					s.billing.attach({
						customerId: customerBId,
						productId: pro.id,
					}),
				),
			],
		});

		const before = await customerFixedStripePriceId({
			ctx,
			customerId,
			catalogProductId: pro.id,
		});

		const migrationId = await updatePlanPriceInPlace({
			autumn: autumnV2_3,
			planId: pro.id,
			amount: 40,
		});
		await runCatalogDraft({ ctx, migrationId });

		const a = await customerFixedStripePriceId({
			ctx,
			customerId,
			catalogProductId: pro.id,
		});
		const b = await customerFixedStripePriceId({
			ctx,
			customerId: customerBId,
			catalogProductId: pro.id,
		});

		expect(a.customerStripePriceId).toBeTruthy();
		expect(b.customerStripePriceId).toBe(a.customerStripePriceId);
		expect(a.customerStripePriceId).not.toBe(before.catalogStripePriceId);
	},
);

test.concurrent(
	`${chalk.yellowBright("reuse migrate fixed: B $20 → $40 reuses one live $40 Stripe Price")}`,
	async () => {
		const customerBId = "reuse-mig-b-reuse";
		const pro = products.pro({ id: "reuse-mig-ab-reuse", items: [] });

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "reuse-mig-a-reuse",
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.otherCustomers([{ id: customerBId, paymentMethod: "success" }]),
			],
			actions: [],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 40 }) },
		});
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerBId,
			plan_id: pro.id,
		});

		const aBefore = await customerFixedStripePriceId({
			ctx,
			customerId,
			catalogProductId: pro.id,
		});
		const bBefore = await customerFixedStripePriceId({
			ctx,
			customerId: customerBId,
			catalogProductId: pro.id,
		});

		const migrationId = await updatePlanPriceInPlace({
			autumn: autumnV2_3,
			planId: pro.id,
			amount: 40,
		});
		await runCatalogDraft({ ctx, migrationId });

		const aAfter = await customerFixedStripePriceId({
			ctx,
			customerId,
			catalogProductId: pro.id,
		});
		const bAfter = await customerFixedStripePriceId({
			ctx,
			customerId: customerBId,
			catalogProductId: pro.id,
		});

		expect(bAfter.customerStripePriceId).toBeTruthy();
		expect(bAfter.customerStripePriceId).not.toBe(bBefore.customerStripePriceId);
		expect([
			aBefore.customerStripePriceId,
			aAfter.catalogStripePriceId,
			aAfter.customerStripePriceId,
		]).toContain(bAfter.customerStripePriceId);
	},
);
