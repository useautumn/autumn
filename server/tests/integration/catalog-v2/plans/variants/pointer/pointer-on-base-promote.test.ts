/**
 * catalogV2.update — base promote does not auto-repoint variants.
 *
 * Contract:
 *   promote without propagate → pointer stays on the previous active row
 *   Historical variant versions stay on their existing base row.
 *   Active variant pinned to a non-active historical base is left.
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { deleteDbPlans, expectPlanVersionsCorrect } from "../../utils/expectCatalogPlans.js";
import { forceActiveVersion } from "../../utils/expectVersionIdentity.js";
import { messagesItem } from "../../licenses/utils/seedLicensePlans.js";
import {
	expectVariantPlanCorrect,
	expectVariantPointerCorrect,
} from "../utils/expectVariantPointer.js";
import {
	seedBaseWithVariant,
	seedVariantNewVersion,
} from "../utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: base promote without propagate leaves pointer on v1")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_pr_fol");
		const variantId = uniqueTestId("cv2_var_pr_fol_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						versioning: "new_version",
						items: [messagesItem(100)],
					},
				],
			});
			await expectVariantPointerCorrect({
				ctx,
				variantPlanId: variantId,
				basePlanId: baseId,
				baseVersion: 1,
			});

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: baseId, version_slug: "v2", active: true }],
			});

			await expectPlanVersionsCorrect({
				ctx,
				planId: variantId,
				versions: [1],
			});
			await expectVariantPointerCorrect({
				ctx,
				variantPlanId: variantId,
				basePlanId: baseId,
				baseVersion: 1,
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: variantId,
				allowances: { [TestFeature.Messages]: 200 },
				featureIds: [TestFeature.Messages],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: base promote leaves historical variant v1 on the old row")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_pr_hist");
		const variantId = uniqueTestId("cv2_var_pr_hist_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			await seedVariantNewVersion({ autumn: autumnV2_3, variantId });
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: baseId, versioning: "new_version" }],
			});

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: baseId, version_slug: "v2", active: true }],
			});

			await expectVariantPointerCorrect({
				ctx,
				variantPlanId: variantId,
				variantVersion: 1,
				basePlanId: baseId,
				baseVersion: 1,
			});
			await expectVariantPointerCorrect({
				ctx,
				variantPlanId: variantId,
				variantVersion: 2,
				basePlanId: baseId,
				baseVersion: 1,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: promote leaves a pin at a historical non-active base")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_pr_pin");
		const variantId = uniqueTestId("cv2_var_pr_pin_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: baseId, versioning: "new_version" }],
			});
			await forceActiveVersion({ ctx, planId: baseId, version: 2 });
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: baseId, versioning: "new_version" }],
			});

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: baseId, version_slug: "v3", active: true }],
			});

			await expectPlanVersionsCorrect({
				ctx,
				planId: variantId,
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
