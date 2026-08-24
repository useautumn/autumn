/**
 * catalogV2.preview_update — remove_plans dialog reasons.
 */

import { CusProductStatus, ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import { test } from "bun:test";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { expectCatalogPreviewCorrect } from "../../utils/expectCatalogUpdate.js";
import { cleanupPlanCustomerRefs } from "../utils/cleanupPlanCustomerRefs.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";
import { seedVersionableCustomer } from "../migrations/utils/seedVersionableCustomer.js";
import { seedBaseWithVariant } from "../variants/utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans preview: customer sample becomes archive reasons")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_rmp_prev_cus");
		await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Pro" }],
			});
			const { customerId } = await seedVersionableCustomer({
				ctx,
				planId,
			});

			expectCatalogPreviewCorrect({
				preview: await autumnV2_3.catalogV2.previewUpdate({
					remove_plans: [{ plan_id: planId }],
				}),
				plans: [
					{
						planId,
						action: "delete",
						willArchive: true,
						reasonsInclude: [
							`Cannot delete plan "Pro", archive it instead.`,
							`Attached to customer "${customerId}".`,
						],
					},
				],
			});
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans preview: expired customers are omitted from attached-to reasons")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_rmp_prev_exp");
		await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Draft" }],
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						versioning: "new_version",
						name: "Draft v2",
					},
				],
			});
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
						reasonMessages: [
							"Are you sure you want to delete this version? This action cannot be undone.",
						],
					},
				],
			});
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans preview: two customers and an unreferenced delete")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const withCustomersId = uniqueTestId("cv2_rmp_prev_two");
		const freeId = uniqueTestId("cv2_rmp_prev_free");
		await cleanupPlanCustomerRefs({
			ctx,
			planIds: [withCustomersId, freeId],
		});
		await deleteDbPlans({ ctx, planIds: [withCustomersId, freeId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: withCustomersId, name: "Busy" },
					{ plan_id: freeId, name: "Free" },
				],
			});
			await seedVersionableCustomer({ ctx, planId: withCustomersId });
			await seedVersionableCustomer({ ctx, planId: withCustomersId });

			const preview = await autumnV2_3.catalogV2.previewUpdate({
				remove_plans: [
					{ plan_id: withCustomersId },
					{ plan_id: freeId },
				],
			});
			expectCatalogPreviewCorrect({
				preview,
				plans: [
					{
						planId: withCustomersId,
						action: "delete",
						willArchive: true,
						reasonsInclude: [
							`Cannot delete plan "Busy", archive it instead.`,
							"and 1 more.",
						],
					},
					{
						planId: freeId,
						action: "delete",
						willArchive: false,
						reasonMessages: [
							"Are you sure you want to delete this plan? This action cannot be undone.",
						],
					},
				],
			});
		} finally {
			await cleanupPlanCustomerRefs({
				ctx,
				planIds: [withCustomersId, freeId],
			});
			await deleteDbPlans({ ctx, planIds: [withCustomersId, freeId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans preview: deleting a base with variants is 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_rmp_prev_base");
		const variantId = uniqueTestId("cv2_rmp_prev_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				errMessage: `Cannot delete or archive plan ${baseId} while it still has variants`,
				func: () =>
					autumnV2_3.catalogV2.previewUpdate({
						remove_plans: [{ plan_id: baseId }],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);
