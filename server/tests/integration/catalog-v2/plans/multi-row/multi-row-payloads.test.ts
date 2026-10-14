import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { withCatalogPlans } from "../licenses/utils/seedLicensePlans.js";

const messagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
});

const versionsOf = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}) => {
	const all = await ProductService.listFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		returnAll: true,
		skipCache: true,
	});
	return all
		.filter((product) => product.id === planId)
		.sort((a, b) => a.version - b.version);
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 multi-row: a new plan is created with its whole history in one request")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_mr_history");

		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							name: "History",
							version_slug: "v1",
							items: [messagesItem(100)],
						},
						{
							plan_id: planId,
							name: "History",
							version_slug: "v2",
							items: [messagesItem(200)],
						},
						{
							plan_id: planId,
							name: "History",
							version_slug: "v3",
							items: [messagesItem(300)],
							active: true,
						},
					],
				});

				const versions = await versionsOf({ ctx, planId });
				expect(
					versions.map((row) => row.version),
					"three rows",
				).toEqual([1, 2, 3]);
				expect(
					versions.map(
						(row) =>
							row.entitlements.find(
								(ent) => ent.feature?.id === TestFeature.Messages,
							)?.allowance,
					),
					"each row kept its own content",
				).toEqual([100, 200, 300]);
				expect(
					versions.find((row) => row.active)?.version,
					"the stated row holds the pointer",
				).toBe(3);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 multi-row: stated rows beat the derived fan-out")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_mr_claim");

		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{ plan_id: planId, name: "Claim", items: [messagesItem(100)] },
					],
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: planId,
							items: [messagesItem(200)],
							versioning: "new_version",
							active: true,
						},
					],
				});

				await autumnV2_3.catalogV2.update({
					plans: [
						{ plan_id: planId, version: 1, items: [messagesItem(150)] },
						{
							plan_id: planId,
							versioning: "all_versions",
							items: [messagesItem(999)],
						},
					],
				});

				const versions = await versionsOf({ ctx, planId });
				const allowanceAt = (version: number) =>
					versions
						.find((row) => row.version === version)
						?.entitlements.find(
							(ent) => ent.feature?.id === TestFeature.Messages,
						)?.allowance;

				expect(allowanceAt(1), "pinned row kept its own content").toBe(150);
				expect(allowanceAt(2), "the fan-out still reached unclaimed rows").toBe(
					999,
				);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 multi-row: genuinely ambiguous entries are still rejected")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_mr_guard");

		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{ plan_id: planId, name: "Guard", items: [messagesItem(100)] },
					],
				});

				const samePin = autumnV2_3.catalogV2.update({
					plans: [
						{ plan_id: planId, version: 1, items: [messagesItem(150)] },
						{ plan_id: planId, version: 1, items: [messagesItem(250)] },
					],
				});
				await expect(samePin).rejects.toThrow();

				const bothUnpinned = autumnV2_3.catalogV2.update({
					plans: [
						{ plan_id: planId, items: [messagesItem(150)] },
						{ plan_id: planId, items: [messagesItem(250)] },
					],
				});
				await expect(bothUnpinned).rejects.toThrow();
			},
		});
	},
);
