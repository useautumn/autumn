// A live plan needs an active version; archiving the whole family remains valid.
// Renames must explicitly move every version together.

import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
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
	`${chalk.yellowBright("catalogV2 transitions: an internal_id rename must explicitly include the whole plan's history")}`,
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

				await expectAutumnError({
					errCode: ErrCode.InvalidRequest,
					errMessage: `Rename every version to ${renamedId}, or none`,
					func: () =>
						autumnV2_3.catalogV2.update({
							plans: [
								{
									plan_id: renamedId,
									internal_id: v3?.internal_id,
									name: "Carried",
								},
							],
						}),
				});
				for (const version of [1, 2, 3]) {
					expect((await versionRow({ ctx, planId, version }))?.id).toBe(planId);
				}
				await autumnV2_3.catalogV2.update({
					plans: await Promise.all(
						[1, 2, 3].map(async (version) => ({
							plan_id: renamedId,
							internal_id: (await versionRow({ ctx, planId, version }))
								?.internal_id,
							name: "Carried",
						})),
					),
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
