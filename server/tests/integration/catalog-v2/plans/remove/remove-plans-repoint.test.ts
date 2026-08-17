/**
 * catalogV2.update — pin-deleting a base version repoints surviving
 * variants at the remaining live version, or 400s if none remains.
 *
 * Contract:
 *   Pin-delete Team v2 while v1 lives → EU points at v1
 *   Pin-delete Team v1 while EU points at v2 → v1 gone, EU still v2
 *   Pin-delete last remaining Team version while EU survives → 400
 */

import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import { test } from "bun:test";
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

const seedBaseV2WithVariant = async ({
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
		plans: [{ plan_id: baseId, versioning: "new_version" }],
	});
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans: pin-delete latest base version repoints the variant")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_rmp_rp_v2");
		const variantId = uniqueTestId("cv2_rmp_rp_v2_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseV2WithVariant({
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

			await autumnV2_3.catalogV2.update({
				remove_plans: [{ plan_id: baseId, version: 2 }],
			});

			await expectPlanVersionsCorrect({
				ctx,
				planId: baseId,
				versions: [1],
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

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans: pin-delete unused base version leaves the variant pointer")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_rmp_rp_old");
		const variantId = uniqueTestId("cv2_rmp_rp_old_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseV2WithVariant({
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
