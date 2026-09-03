/**
 * catalogV2 — one request carries many rows of the same plan.
 *
 * A config file holds the whole pricing history, so a push states every
 * version at once: pro@1 was $10, pro@2 was $20, pro@3 is $30. Today the
 * server assumes one entry per plan and rejects the rest.
 *
 * The invariant this must not break is John's: explicitly stated rows map
 * 1:1 to intents, and the derivation that fans a change out to siblings and
 * variants must not ALSO claim a row the payload named. That is already how
 * `claimProductKeys` + `claimNewIntents` behave; these tests pin it so the
 * multi-row work cannot quietly regress it.
 *
 * Contract:
 *   B1  N rows of one plan → N intents, and derived fan-out claims none of
 *       the rows the payload named (explicit beats derived)
 *   B2  a brand-new plan can be created with its whole history in one request
 *   B3  an unknown version_slug with no internal_id mints a version, rather
 *       than being rejected as unknown
 *   B4  two entries pinning the same version is still an error
 *   B5  two unpinned entries for one plan is still an error
 *   B6  migration.draft on one entry claims that entry's row only
 *
 * Red (current): the create-with-multiple-entries guard, the unknown-slug
 *   rejection, and the version-gap check each reject a full-history push.
 * Green (after): the payload's own rows count, and the guards that remain
 *   are only the genuinely ambiguous ones.
 */

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
				// B2 + B3: three rows of a plan that does not exist yet. Each names a
				// slug nothing owns, which today is rejected twice over — once by the
				// create-with-multiple-entries guard, once by the version gap check,
				// since neither counts rows minted earlier in the same request.
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

				// B1: one entry pins v1 with its own content while another asks for
				// `all_versions`, whose fan-out would otherwise rewrite every sibling
				// — v1 included. The stated row must win: explicit beats derived.
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

				// B4: two entries pinning the same row — which one wins is undefined.
				const samePin = autumnV2_3.catalogV2.update({
					plans: [
						{ plan_id: planId, version: 1, items: [messagesItem(150)] },
						{ plan_id: planId, version: 1, items: [messagesItem(250)] },
					],
				});
				await expect(samePin).rejects.toThrow();

				// B5: two entries naming no row at all — same ambiguity.
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
