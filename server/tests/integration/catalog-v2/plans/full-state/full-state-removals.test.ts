/**
 * catalogV2.update — `skip_deletions: false` makes the payload the whole catalog.
 *
 * Today the server only reasons about plans the request names, so deleting a
 * plan from a config file does nothing at all: the row sits in production
 * forever. Full state loads the catalog and reads an omission as a removal,
 * which is what makes a config file the source of truth rather than a set of
 * patches.
 *
 * Contract:
 *   C1  skip_deletions:false loads the whole catalog, not just payload plans
 *   C2  a plan the catalog holds but the payload omits is removed
 *   C3  skip_plan_ids exempts a plan from that
 *   C4  archived plans are not re-proposed — they are already off the surface
 *   C5  zero stated plans against a non-empty catalog is refused, not a wipe
 *   C6  the default is unchanged: omitting skip_deletions touches nothing
 *   C7  restating an archived plan revives it — presence is the signal
 *
 * Red (current): setup is payload-scoped, so absentees are uncomputable and
 *   every assertion below either no-ops or cannot see the plan.
 * Green (after): omission is a removal, with the guards above around it.
 */

import { expect, test } from "bun:test";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { withCatalogPlans } from "../licenses/utils/seedLicensePlans.js";

const planExists = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}): Promise<boolean> => {
	const product = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		allowNotFound: true,
	});
	return product != null && product.archived !== true;
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 full-state: an omitted plan is removed, a skipped one is not")}`,
	async () => {
		// Full state speaks for the entire org catalog, so it needs an org of its
		// own — in a shared one it would remove every concurrent test's plans.
		const { autumnV2_3, ctx } = await initScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("fs")}@autumn.test`,
				}),
			],
			actions: [],
		});
		const keptId = uniqueTestId("cv2_fs_kept");
		const droppedId = uniqueTestId("cv2_fs_dropped");
		const skippedId = uniqueTestId("cv2_fs_skipped");

		await withCatalogPlans({
			ctx,
			planIds: [keptId, droppedId, skippedId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{ plan_id: keptId, name: "Kept", items: [] },
						{ plan_id: droppedId, name: "Dropped", items: [] },
						{ plan_id: skippedId, name: "Skipped", items: [] },
					],
				});

				// C1 + C2 + C3: only `kept` is stated. `dropped` goes because the
				// config no longer mentions it; `skipped` stays because it was named
				// as out of scope rather than deleted.
				await autumnV2_3.catalogV2.update({
					skip_deletions: false,
					skip_plan_ids: [skippedId],
					plans: [{ plan_id: keptId, name: "Kept", items: [] }],
				});

				expect(await planExists({ ctx, planId: keptId }), "stated plan").toBe(
					true,
				);
				expect(
					await planExists({ ctx, planId: droppedId }),
					"omitted plan removed",
				).toBe(false);
				expect(
					await planExists({ ctx, planId: skippedId }),
					"skip_plan_ids plan untouched",
				).toBe(true);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 full-state: an empty payload is refused rather than wiping the catalog")}`,
	async () => {
		// Full state speaks for the entire org catalog, so it needs an org of its
		// own — in a shared one it would remove every concurrent test's plans.
		const { autumnV2_3, ctx } = await initScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("fs")}@autumn.test`,
				}),
			],
			actions: [],
		});
		const planId = uniqueTestId("cv2_fs_wipe");

		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: planId, name: "Survivor", items: [] }],
				});

				// C5: a config that failed to load looks exactly like this. Deleting
				// a live catalog is not recoverable, so it is refused.
				const wipe = autumnV2_3.catalogV2.update({
					skip_deletions: false,
					plans: [],
				});
				await expect(wipe).rejects.toThrow();

				expect(
					await planExists({ ctx, planId }),
					"catalog survived the empty payload",
				).toBe(true);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 full-state: the default leaves unmentioned plans alone")}`,
	async () => {
		// Full state speaks for the entire org catalog, so it needs an org of its
		// own — in a shared one it would remove every concurrent test's plans.
		const { autumnV2_3, ctx } = await initScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("fs")}@autumn.test`,
				}),
			],
			actions: [],
		});
		const statedId = uniqueTestId("cv2_fs_stated");
		const untouchedId = uniqueTestId("cv2_fs_untouched");

		await withCatalogPlans({
			ctx,
			planIds: [statedId, untouchedId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{ plan_id: statedId, name: "Stated", items: [] },
						{
							plan_id: untouchedId,
							name: "Untouched",
							items: [],
						},
					],
				});

				// C6: every existing caller omits skip_deletions, and none of them
				// expect a patch to delete the rest of the catalog.
				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: statedId, name: "Stated Again", items: [] }],
				});

				expect(
					await planExists({ ctx, planId: untouchedId }),
					"unmentioned plan survives a patch",
				).toBe(true);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 full-state: restating an archived plan brings it back")}`,
	async () => {
		// Full state speaks for the entire org catalog, so it needs an org of its
		// own — in a shared one it would remove every concurrent test's plans.
		const { autumnV2_3, ctx } = await initScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("fs")}@autumn.test`,
				}),
			],
			actions: [],
		});
		const planId = uniqueTestId("cv2_fs_revive");

		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: planId, name: "Retired", items: [] }],
				});
				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: planId, archived: true }],
				});
				expect(
					await planExists({ ctx, planId }),
					"archived before the revive",
				).toBe(false);

				// C7: archived rows never live in a config, so stating one again is
				// the whole signal. No `archived: false` — presence is the ask.
				await autumnV2_3.catalogV2.update({
					skip_deletions: false,
					plans: [{ plan_id: planId, name: "Back", items: [] }],
				});

				expect(await planExists({ ctx, planId }), "revived by presence").toBe(
					true,
				);
			},
		});
	},
);
