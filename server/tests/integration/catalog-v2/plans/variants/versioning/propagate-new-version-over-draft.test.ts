/**
 * catalogV2.update — a second new_version while an unpromoted draft exists.
 *
 * Red (before): the follower guard called the variant's ACTIVE v1 "historical"
 * because a draft v2 sat above it, and refused with "historical version has
 * customers". Green (after): historical means not active, so v3 drafts mint.
 */
import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	dashboardItem,
	messagesItem,
	withCatalogPlans,
} from "../../licenses/utils/seedLicensePlans.js";
import { seedVersionableCustomer } from "../../migrations/utils/seedVersionableCustomer.js";
import { expectVersionIdentityCorrect } from "../../utils/expectVersionIdentity.js";
import { seedBaseWithVariant } from "../utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: new_version from the active row mints again while a draft sits above it")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_draft_above");
		const variantId = uniqueTestId("cv2_var_draft_above_eu");
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

				// First versioning: v2 drafts for the base and its follower, never promoted.
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

				// Second versioning from the still-active v1: must mint v3 drafts, not 400.
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							items: [messagesItem(80), dashboardItem()],
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
					version: 3,
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
					version: 3,
					active: false,
					isDefault: false,
				});
			},
		});
	},
);
