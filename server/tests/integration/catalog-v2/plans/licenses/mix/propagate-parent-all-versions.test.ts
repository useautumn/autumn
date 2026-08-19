/**
 * catalogV2.update — propagate.license_parents[].versioning across parent
 * versions. Omitting it targets latest; `all_versions` fans out to every
 * parent version that offers the child.
 */
import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { expectLicenseLinkCorrect } from "../utils/expectLicenseLinkCorrect.js";
import {
	bumpChild,
	seedTwoParentVersions,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: parent all_versions follows on every parent version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_pav_p");
		const childId = uniqueTestId("cv2_lic_pav_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedTwoParentVersions({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await bumpChild({
					autumn: autumnV2_3,
					childId,
					included: 200,
					propagate: {
						license_parents: [
							{ plan_id: parentId, versioning: "all_versions" },
						],
					},
				});

				for (const parentVersion of [1, 2]) {
					await expectLicenseLinkCorrect({
						ctx,
						parentPlanId: parentId,
						parentVersion,
						licensePlanId: childId,
						customized: false,
						messagesAllowance: 200,
					});
				}
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: parent without versioning freezes historical versions")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_lic_pav_lat_p");
		const childId = uniqueTestId("cv2_lic_pav_lat_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedTwoParentVersions({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await bumpChild({
					autumn: autumnV2_3,
					childId,
					included: 200,
					propagate: { license_parents: [{ plan_id: parentId }] },
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 1,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 10,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					parentVersion: 2,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 200,
				});
			},
		});
	},
);
