/**
 * catalogV2.update — child edit fans out to a base parent and its variant.
 *
 * No variant derive. Seat is offered by Team and Team-EU.
 */

import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { expectLicenseLinkCorrect } from "../../licenses/utils/expectLicenseLinkCorrect.js";
import {
	messagesItem,
	withCatalogPlans,
} from "../../licenses/utils/seedLicensePlans.js";
import { seedBaseVariantWithChildLicense } from "../utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: child propagate to base + variant parents writes both links")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_c2p");
		const variantId = uniqueTestId("cv2_var_c2p_eu");
		const childId = uniqueTestId("cv2_var_c2p_seat");
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
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(200)],
							propagate: {
								license_parents: [
									{ plan_id: baseId, version: 1 },
									{ plan_id: variantId, version: 1 },
								],
							},
						},
					],
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: baseId,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 200,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: variantId,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 200,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: child propagate to variant parent only leaves base frozen")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_c2p_pin");
		const variantId = uniqueTestId("cv2_var_c2p_pin_eu");
		const childId = uniqueTestId("cv2_var_c2p_pin_seat");
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
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(200)],
							propagate: {
								license_parents: [{ plan_id: variantId, version: 1 }],
							},
						},
					],
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: baseId,
					licensePlanId: childId,
					messagesAllowance: 10,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: variantId,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 200,
				});
			},
		});
	},
);
