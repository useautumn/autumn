/** Base removal cannot strand a retained variant; removing both unused rows is valid. */

import { test } from "bun:test";
import { CusProductStatus, ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { seedVersionableCustomer } from "../migrations/utils/seedVersionableCustomer.js";
import { cleanupPlanCustomerRefs } from "../utils/cleanupPlanCustomerRefs.js";
import {
	deleteDbPlans,
	expectCatalogPlansCorrect,
	expectDbPlansAbsent,
	expectDbPlansCorrect,
} from "../utils/expectCatalogPlans.js";
import { expectVariantPointerCorrect } from "../variants/utils/expectVariantPointer.js";
import { seedBaseWithVariant } from "../variants/utils/seedVariantPlans.js";

const cannotRemoveWithVariant = ({
	action,
	baseId,
	variantId,
	variantArchived = false,
}: {
	action: "archive" | "delete";
	baseId: string;
	variantId: string;
	variantArchived?: boolean;
}) =>
	`Cannot ${action} plan ${baseId} because ${variantArchived ? "archived variant" : "variant"} ${variantId} would still link to it. Link the variant to another base version before ${action === "archive" ? "archiving" : "deleting"} this plan.`;

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans: unpinned delete of a base with variants is 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_rmp_var_del");
		const variantId = uniqueTestId("cv2_rmp_var_del_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});

			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				errMessage: cannotRemoveWithVariant({
					action: "delete",
					baseId,
					variantId,
				}),
				func: () =>
					autumnV2_3.catalogV2.update({
						remove_plans: [{ plan_id: baseId }],
					}),
			});

			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [{ id: baseId, name: "Team" }],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans: unpinned archive of a base with variants is 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_rmp_var_arch");
		const variantId = uniqueTestId("cv2_rmp_var_arch_eu");
		await cleanupPlanCustomerRefs({ ctx, planIds: [baseId, variantId] });
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			await seedVersionableCustomer({ ctx, planId: baseId });

			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				errMessage: cannotRemoveWithVariant({
					action: "archive",
					baseId,
					variantId,
				}),
				func: () =>
					autumnV2_3.catalogV2.update({
						remove_plans: [{ plan_id: baseId }],
					}),
			});

			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [{ id: baseId, name: "Team", archived: false }],
			});
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [baseId, variantId] });
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans: archive variant plus tombstone base is 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({
			setup: [s.platform.create({ setupDefaultFeatures: true })],
			actions: [],
		});
		const baseId = uniqueTestId("cv2_rmp_var_tomb");
		const variantId = uniqueTestId("cv2_rmp_var_tomb_eu");
		await cleanupPlanCustomerRefs({ ctx, planIds: [baseId, variantId] });
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({ autumn: autumnV2_3, baseId, variantId });
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						versioning: "new_version",
					},
				],
			});
			await seedVersionableCustomer({
				ctx,
				planId: baseId,
				version: 1,
				status: CusProductStatus.Expired,
			});
			await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });

			const params = {
				skip_deletions: false,
				skip_version_deletions: false,
				plans: [{ plan_id: baseId, version_slug: "v2", active: true }],
			};
			for (const func of [
				() => autumnV2_3.catalogV2.previewUpdate(params),
				() => autumnV2_3.catalogV2.update(params),
			]) {
				await expectAutumnError({
					errCode: ErrCode.InvalidRequest,
					errMessage: cannotRemoveWithVariant({
						action: "delete",
						baseId,
						variantId,
						variantArchived: true,
					}),
					func,
				});
			}

			await expectDbPlansCorrect({
				ctx,
				expected: [
					{ id: baseId, version: 1, archived: false },
					{ id: variantId, version: 1, archived: false },
				],
			});
			await expectVariantPointerCorrect({
				ctx,
				variantPlanId: variantId,
				basePlanId: baseId,
				baseVersion: 1,
			});
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [baseId, variantId] });
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans: same-call remove of base and variant hard-deletes both")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_rmp_var_both");
		const variantId = uniqueTestId("cv2_rmp_var_both_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			await autumnV2_3.catalogV2.update({
				remove_plans: [{ plan_id: baseId }, { plan_id: variantId }],
			});
			await expectDbPlansAbsent({ ctx, planIds: [baseId, variantId] });
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);
