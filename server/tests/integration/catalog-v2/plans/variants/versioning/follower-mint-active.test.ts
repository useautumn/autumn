/**
 * catalogV2.update — variant follower mint follows the base's planParams.active.
 *
 * Contract:
 *   base new_version omit active + propagate.variants → minted variant is draft
 *   same with base active:true → minted variant is active
 */

import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { seedVersionableCustomer } from "../../migrations/utils/seedVersionableCustomer.js";
import {
	dashboardItem,
	messagesItem,
	withCatalogPlans,
} from "../../licenses/utils/seedLicensePlans.js";
import { expectVersionIdentityCorrect } from "../../utils/expectVersionIdentity.js";
import { seedBaseWithVariant } from "../utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: follower mint without base active stays a draft")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_fma_d");
		const variantId = uniqueTestId("cv2_var_fma_d_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(100), dashboardItem()],
							versioning: "new_version",
							propagate: { variants: [{ plan_id: variantId }] },
						},
					],
				});

				await expectVersionIdentityCorrect({
					ctx,
					planId: baseId,
					version: 1,
					active: true,
				});
				await expectVersionIdentityCorrect({
					ctx,
					planId: baseId,
					version: 2,
					active: false,
					isDefault: false,
				});
				await expectVersionIdentityCorrect({
					ctx,
					planId: variantId,
					version: 1,
					active: true,
				});
				await expectVersionIdentityCorrect({
					ctx,
					planId: variantId,
					version: 2,
					active: false,
					isDefault: false,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: follower mint with base active:true is active")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_fma_a");
		const variantId = uniqueTestId("cv2_var_fma_a_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(100), dashboardItem()],
							versioning: "new_version",
							active: true,
							propagate: { variants: [{ plan_id: variantId }] },
						},
					],
				});

				await expectVersionIdentityCorrect({
					ctx,
					planId: baseId,
					version: 2,
					active: true,
				});
				await expectVersionIdentityCorrect({
					ctx,
					planId: variantId,
					version: 1,
					active: false,
				});
				await expectVersionIdentityCorrect({
					ctx,
					planId: variantId,
					version: 2,
					active: true,
					isDefault: false,
				});
			},
		});
	},
);
