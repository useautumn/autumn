/**
 * Pin-remove of a non-live version with only expired customers stamps
 * willTombstone (preview will_archive: false). Whole-plan expired-only
 * also tombstones (will_archive: false).
 */

import { test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { expectCatalogPreviewCorrect } from "../../utils/expectCatalogUpdate.js";
import { seedVersionableCustomer } from "../migrations/utils/seedVersionableCustomer.js";
import { cleanupPlanCustomerRefs } from "../utils/cleanupPlanCustomerRefs.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";

const seedV1AndDraftV2 = async ({
	autumn,
	planId,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	planId: string;
}) => {
	await autumn.catalogV2.update({
		plans: [{ plan_id: planId, name: "V1" }],
	});
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				versioning: "new_version",
				name: "V2 Draft",
			},
		],
	});
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove: pin expired-only draft is not archive; unpinned still is")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_rmp_tomb_verdict");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndDraftV2({ autumn: autumnV2_3, planId });
			await seedVersionableCustomer({
				ctx,
				planId,
				version: 2,
				status: CusProductStatus.Expired,
			});

			expectCatalogPreviewCorrect({
				preview: await autumnV2_3.catalogV2.previewUpdate({
					remove_plans: [{ plan_id: planId, version: 2 }],
				}),
				plans: [
					{
						planId,
						action: "delete",
						willArchive: false,
						hasCustomers: true,
					},
				],
			});

			expectCatalogPreviewCorrect({
				preview: await autumnV2_3.catalogV2.previewUpdate({
					remove_plans: [{ plan_id: planId }],
				}),
				plans: [
					{
						planId,
						action: "delete",
						willArchive: false,
						hasCustomers: true,
					},
				],
			});
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
