/**
 * catalogV2.update — a direct variant `new_version` mint inherits the
 * source row's anchor. A base and its variant cannot both be top-level
 * plans[] entries — that edit must go through base.variants[].
 */

import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	messagesItem,
	withCatalogPlans,
} from "../../licenses/utils/seedLicensePlans.js";
import { expectVariantPointerCorrect } from "../utils/expectVariantPointer.js";
import {
	seedBaseWithVariant,
	seedDivergedVariantBase,
} from "../utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: direct new_version mint inherits the source row's anchor")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_anc_dir");
		const variantId = uniqueTestId("cv2_var_anc_dir_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await seedDivergedVariantBase({ autumn: autumnV2_3, baseId });
				await autumnV2_3.catalogV2.update({
					plans: [
						{ plan_id: variantId, versioning: "new_version", active: true },
					],
				});

				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: variantId,
					variantVersion: 1,
					basePlanId: baseId,
					baseVersion: 1,
				});
				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: variantId,
					variantVersion: 2,
					basePlanId: baseId,
					baseVersion: 1,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: top-level base + its variant → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_anc_dir2");
		const variantId = uniqueTestId("cv2_var_anc_dir2_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await expectAutumnError({
					errCode: ErrCode.InvalidRequest,
					errMessage: "not as a sibling top-level plan",
					func: () =>
						autumnV2_3.catalogV2.update({
							plans: [
								{
									plan_id: baseId,
									items: [messagesItem(50)],
									versioning: "new_version",
									active: true,
								},
								{
									plan_id: variantId,
									versioning: "new_version",
									active: true,
								},
							],
						}),
				});
			},
		});
	},
);
