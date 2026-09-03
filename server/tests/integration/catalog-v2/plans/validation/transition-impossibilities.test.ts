/**
 * catalogV2.update — the one state no derivation can make coherent.
 *
 * Most of what looks like a rejection is really an outcome the server works
 * out: an edit to a customered row needs a migration, an unknown slug mints,
 * an absent plan is removed. What is left over is a payload describing a
 * catalog that cannot exist, and that has to be an error because there is
 * nothing correct to derive.
 *
 * Of the five candidates, four were already covered: two rows claiming active
 * (handleUpsertProductActiveErrors), a slug landing on a row that still holds
 * it (handleUpsertProductVersionSlugErrors, over the projected set so swaps
 * stay legal), a variant orphaned by a base removal
 * (handleRemovePlanVariantErrors), and a rename moving only part of a plan —
 * which turns out to be unreachable, since an internal_id rename resolves to a
 * plan-level rename that carries every version.
 *
 * Contract:
 *   F1  archiving the active row while a live sibling remains is rejected —
 *       the pointer would name a version nothing can attach to
 *   F2  archiving every row of a plan still works, which is why F1 has to be
 *       a rule about the pointer and not about archiving
 *   F3  an internal_id rename carries the plan's whole history, pointer
 *       included — the row addressed is the handle, not the scope
 *
 * Red (current): nothing inspects the projected active pointer, so F1 is
 *   accepted and the plan is left current-versionless.
 * Green (after): F1 is a 400 naming the row in the way.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { withCatalogPlans } from "../licenses/utils/seedLicensePlans.js";

const messagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
});

const versionRow = async ({
	ctx,
	planId,
	version,
}: {
	ctx: AutumnContext;
	planId: string;
	version: number;
}) =>
	ProductService.get({
		db: ctx.db,
		id: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});

/** Mint `count` versions, each taking the active pointer as it lands. */
const seedVersions = async ({
	autumn,
	planId,
	count,
}: {
	autumn: AutumnInt;
	planId: string;
	count: number;
}) => {
	await autumn.catalogV2.update({
		plans: [{ plan_id: planId, name: "Seeded", items: [messagesItem(100)] }],
	});
	for (let version = 2; version <= count; version++) {
		await autumn.catalogV2.update({
			plans: [
				{
					plan_id: planId,
					items: [messagesItem(100 * version)],
					versioning: "new_version",
					active: true,
				},
			],
		});
	}
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 transitions: archiving the active row is refused while a live sibling remains")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_imp_ptr");

		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await seedVersions({ autumn: autumnV2_3, planId, count: 2 });

				// F1: v2 holds the pointer. Archiving only v2 leaves the plan live —
				// v1 is still there — pointing at a version nothing can attach to.
				const orphanedPointer = autumnV2_3.catalogV2.update({
					plans: [{ plan_id: planId, version: 2, archived: true }],
				});
				await expect(orphanedPointer).rejects.toThrow();

				expect(
					(await versionRow({ ctx, planId, version: 2 }))?.archived,
					"rejected push changed nothing",
				).toBe(false);

				// F2: the same archive is fine once nothing is left behind. This is
				// what stops F1 from being a rule about archiving at all.
				await autumnV2_3.catalogV2.update({
					plans: [
						{ plan_id: planId, version: 1, archived: true },
						{ plan_id: planId, version: 2, archived: true },
					],
				});

				expect(
					(await versionRow({ ctx, planId, version: 2 }))?.archived,
					"whole-plan archive still allowed",
				).toBe(true);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 transitions: an internal_id rename carries the whole plan's history")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_imp_carry");
		const renamedId = `${planId}_renamed`;

		await withCatalogPlans({
			ctx,
			planIds: [planId, renamedId],
			run: async () => {
				await seedVersions({ autumn: autumnV2_3, planId, count: 3 });
				const v3 = await versionRow({ ctx, planId, version: 3 });

				// F3: the config addresses ONE row and states a new plan_id. That is a
				// handle, not a scope — the whole plan moves, so history cannot split
				// across two ids and there is no partial-move case to guard.
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: renamedId,
							internal_id: v3?.internal_id,
							name: "Carried",
						},
					],
				});

				for (const version of [1, 2, 3]) {
					expect(
						(await versionRow({ ctx, planId, version }))?.id,
						`v${version} left the old id`,
					).toBeUndefined();
					expect(
						(await versionRow({ ctx, planId: renamedId, version }))?.id,
						`v${version} arrived under the new id`,
					).toBe(renamedId);
				}
				expect(
					(await versionRow({ ctx, planId: renamedId, version: 3 }))?.active,
					"the pointer came with it",
				).toBe(true);
			},
		});
	},
);
