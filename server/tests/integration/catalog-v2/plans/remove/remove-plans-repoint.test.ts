/**
 * catalogV2.update — pin-deleting a base version is blocked when any
 * variant still points at that row. Unused sibling versions can go.
 *
 * Contract:
 *   Pin-delete Team v2 while EU points at v2 → 400 (no silent repoint)
 *   Pin-delete Team v1 while EU points at v2 → v1 gone, pointer stays on v2
 *   Pin-delete last remaining Team version while EU survives → 400
 *
 * Red (current): pin-delete of a referenced version repoints the variant.
 * Green (after): that delete is 400; the pointer is unchanged.
 */

import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	deleteDbPlans,
	expectPlanVersionsCorrect,
} from "../utils/expectCatalogPlans.js";
import { expectVariantPointerCorrect } from "../variants/utils/expectVariantPointer.js";
import {
	type CatalogV2Client,
	seedBaseWithVariant,
} from "../variants/utils/seedVariantPlans.js";

const cannotRemoveWithVariants = ({ planId }: { planId: string }) =>
	`Cannot delete or archive plan ${planId} while it still has variants`;

const seedBaseV2WithVariantOnV2 = async ({
	autumn,
	baseId,
	variantId,
}: {
	autumn: CatalogV2Client;
	baseId: string;
	variantId: string;
}) => {
	await seedBaseWithVariant({ autumn, baseId, variantId });
	await autumn.catalogV2.update({
		plans: [{ plan_id: baseId, versioning: "new_version", active: true }],
	});
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: baseId,
				version: 2,
				variants: [{ variant_plan_id: variantId, version: 1 }],
			},
		],
	});
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans: pin-delete of a referenced base version is 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_rmp_rp_v2");
		const variantId = uniqueTestId("cv2_rmp_rp_v2_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseV2WithVariantOnV2({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			await expectVariantPointerCorrect({
				ctx,
				variantPlanId: variantId,
				basePlanId: baseId,
				baseVersion: 2,
			});

			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				errMessage: cannotRemoveWithVariants({ planId: baseId }),
				func: () =>
					autumnV2_3.catalogV2.update({
						remove_plans: [{ plan_id: baseId, version: 2 }],
					}),
			});

			await expectPlanVersionsCorrect({
				ctx,
				planId: baseId,
				versions: [1, 2],
			});
			await expectVariantPointerCorrect({
				ctx,
				variantPlanId: variantId,
				basePlanId: baseId,
				baseVersion: 2,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans: pin-delete of an unused old base version leaves the variant on v2")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_rmp_rp_old");
		const variantId = uniqueTestId("cv2_rmp_rp_old_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseV2WithVariantOnV2({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});

			await autumnV2_3.catalogV2.update({
				remove_plans: [{ plan_id: baseId, version: 1 }],
			});

			await expectPlanVersionsCorrect({
				ctx,
				planId: baseId,
				versions: [2],
			});
			await expectVariantPointerCorrect({
				ctx,
				variantPlanId: variantId,
				basePlanId: baseId,
				baseVersion: 2,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans: pin-delete last remaining base version with variants is 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_rmp_rp_last");
		const variantId = uniqueTestId("cv2_rmp_rp_last_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});

			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				errMessage: cannotRemoveWithVariants({ planId: baseId }),
				func: () =>
					autumnV2_3.catalogV2.update({
						remove_plans: [{ plan_id: baseId, version: 1 }],
					}),
			});

			await expectVariantPointerCorrect({
				ctx,
				variantPlanId: variantId,
				basePlanId: baseId,
				baseVersion: 1,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);
