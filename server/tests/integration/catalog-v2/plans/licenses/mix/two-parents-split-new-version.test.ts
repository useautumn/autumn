/**
 * catalogV2.update — two parents, both propagate new_version.
 * Customered parent mints; parent with no customers stays in place.
 */
import { test } from "bun:test";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { seedVersionableCustomer } from "../../migrations/utils/seedVersionableCustomer.js";
import {
	expectLatestPlanVersion,
	expectLicenseLinkCorrect,
} from "../utils/expectLicenseLinkCorrect.js";
import {
	bumpChild,
	seedTwoParents,
	withCatalogPlans,
} from "../utils/seedLicensePlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan-licenses: new_version splits per parent by customers")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const childId = uniqueTestId("cv2_lic_split_c");
		const withCustomersId = uniqueTestId("cv2_lic_split_yes");
		const noCustomersId = uniqueTestId("cv2_lic_split_no");
		await withCatalogPlans({
			ctx,
			planIds: [childId, withCustomersId, noCustomersId],
			run: async () => {
				await seedTwoParents({
					autumn: autumnV2_3,
					childId,
					parentIds: [withCustomersId, noCustomersId],
				});
				await seedVersionableCustomer({
					ctx,
					planId: withCustomersId,
					version: 1,
				});

				await bumpChild({
					autumn: autumnV2_3,
					childId,
					versioning: "new_version",
					propagate: {
						license_parents: [
							{ plan_id: withCustomersId, versioning: "new_version" },
							{ plan_id: noCustomersId, versioning: "new_version" },
						],
					},
				});

				await expectLatestPlanVersion({
					ctx,
					planId: withCustomersId,
					version: 2,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: withCustomersId,
					parentVersion: 2,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 200,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: withCustomersId,
					parentVersion: 1,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 10,
				});

				await expectLatestPlanVersion({
					ctx,
					planId: noCustomersId,
					version: 1,
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: noCustomersId,
					licensePlanId: childId,
					customized: false,
					messagesAllowance: 200,
				});
			},
		});
	},
);
