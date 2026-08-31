/**
 * catalogV2.update — propagate.variants target guards.
 *
 * Unknown / self / a plan that is not this base's variant → 400.
 * Seat.propagate.variants naming Team-EU is the same miss (EU is not a
 * variant of Seat).
 */

import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	dashboardItem,
	messagesItem,
	withCatalogPlans,
} from "../../licenses/utils/seedLicensePlans.js";
import {
	seedBaseVariantWithChildLicense,
	seedBaseWithVariant,
} from "../utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: propagate unknown id → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_tgt_miss");
		const missingId = uniqueTestId("cv2_var_tgt_miss_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, missingId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							name: "Team",
							items: [messagesItem(100)],
						},
					],
				});
				await expectAutumnError({
					errCode: ErrCode.InvalidPropagationTarget,
					func: () =>
						autumnV2_3.catalogV2.update({
							plans: [
								{
									plan_id: baseId,
									items: [messagesItem(100), dashboardItem()],
									propagate: { variants: [{ plan_id: missingId, version: 1 }] },
								},
							],
						}),
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: propagate base's own id → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_tgt_self");
		const variantId = uniqueTestId("cv2_var_tgt_self_eu");
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
					errCode: ErrCode.InvalidPropagationTarget,
					func: () =>
						autumnV2_3.catalogV2.update({
							plans: [
								{
									plan_id: baseId,
									items: [messagesItem(100), dashboardItem()],
									propagate: { variants: [{ plan_id: baseId, version: 1 }] },
								},
							],
						}),
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: Seat.propagate.variants [Team-EU] → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_tgt_seat");
		const variantId = uniqueTestId("cv2_var_tgt_seat_eu");
		const childId = uniqueTestId("cv2_var_tgt_seat_c");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId, childId],
			run: async () => {
				await seedBaseVariantWithChildLicense({
					autumn: autumnV2_3,
					baseId,
					variantId,
					childId,
					customizeLicenses: false,
				});
				await expectAutumnError({
					errCode: ErrCode.InvalidPropagationTarget,
					func: () =>
						autumnV2_3.catalogV2.update({
							plans: [
								{
									plan_id: childId,
									items: [messagesItem(200)],
									propagate: { variants: [{ plan_id: variantId, version: 1 }] },
								},
							],
						}),
				});
			},
		});
	},
);
