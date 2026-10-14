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
	`${chalk.yellowBright("catalogV2 full-state: a stated empty collection removes everything in it")}`,
	async () => {
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

				await autumnV2_3.catalogV2.update({
					skip_deletions: false,
					plans: [],
				});

				expect(
					await planExists({ ctx, planId }),
					"a stated empty collection removed the plan",
				).toBe(false);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 full-state: an omitted collection is still untouchable")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({
			setup: [
				s.platform.create({
					userEmail: `${uniqueTestId("fs")}@autumn.test`,
				}),
			],
			actions: [],
		});
		const planId = uniqueTestId("cv2_fs_omitted");

		await withCatalogPlans({
			ctx,
			planIds: [planId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: planId, name: "Untouched", items: [] }],
				});

				await autumnV2_3.catalogV2.update({
					skip_deletions: false,
					features: [],
				});

				expect(
					await planExists({ ctx, planId }),
					"plans were never mentioned, so they were never swept",
				).toBe(true);
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 full-state: the default leaves unmentioned plans alone")}`,
	async () => {
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
