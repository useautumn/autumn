/**
 * catalogV2.update — license-parent follower mint follows the child's planParams.active.
 *
 * Contract:
 *   child new_version omit active + propagate.license_parents new_version
 *     → child draft mint only; parent stays on active until child takes the pointer
 *   same with child active:true → minted parent is active
 */

import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { seedVersionableCustomer } from "../../migrations/utils/seedVersionableCustomer.js";
import { expectVersionIdentityCorrect } from "../../utils/expectVersionIdentity.js";
import {
	messagesItem,
	seedTwoParentVersions,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: follower mint without child active stays a draft")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_fma_d_p");
		const childId = uniqueTestId("cv2_lic_fma_d_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedTwoParentVersions({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await seedVersionableCustomer({
					ctx,
					planId: parentId,
					version: 2,
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(200)],
							versioning: "new_version",
							propagate: {
								license_parents: [
									{ plan_id: parentId, versioning: "new_version" },
								],
							},
						},
					],
				});

				await expectVersionIdentityCorrect({
					ctx,
					planId: childId,
					version: 2,
					active: false,
				});
				await expectVersionIdentityCorrect({
					ctx,
					planId: parentId,
					version: 2,
					active: true,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: follower mint with child active:true is active")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_fma_a_p");
		const childId = uniqueTestId("cv2_lic_fma_a_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedTwoParentVersions({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await seedVersionableCustomer({
					ctx,
					planId: parentId,
					version: 2,
				});
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(200)],
							versioning: "new_version",
							active: true,
							propagate: {
								license_parents: [
									{ plan_id: parentId, versioning: "new_version" },
								],
							},
						},
					],
				});

				await expectVersionIdentityCorrect({
					ctx,
					planId: childId,
					version: 2,
					active: true,
				});
				await expectVersionIdentityCorrect({
					ctx,
					planId: parentId,
					version: 2,
					active: false,
				});
				await expectVersionIdentityCorrect({
					ctx,
					planId: parentId,
					version: 3,
					active: true,
				});
			},
		});
	},
);
