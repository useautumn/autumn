/**
 * catalogV2.update — unlink a variant from its base.
 *
 * Signal: the base declares its `variants` array WITHOUT a currently-linked
 * variant, AND that variant appears as a top-level plans[] entry in the same
 * call. Unlink nulls base_internal_product_id on ALL the variant's version
 * rows and stops base→variant propagation.
 *
 * Contract:
 *   omit from variants[] + top-level entry → every version row unlinked
 *   omit from variants[] alone → stays linked (no accidental unlink)
 *   top-level edit alone (base absent) → stays linked (current behavior)
 *   after unlink, base edits no longer propagate to the ex-variant
 *   `{ plan_id, base_variant_id: null }` → every version row unlinked
 *   nest `{ variant_plan_id, base_variant_id: null }` → every version row unlinked
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../../utils/expectCatalogPlans.js";
import { messagesItem } from "../../licenses/utils/seedLicensePlans.js";
import {
	expectVariantPlanCorrect,
	expectVariantPointerCorrect,
	expectVariantUnlinkedCorrect,
} from "../utils/expectVariantPointer.js";
import {
	seedBaseWithVariant,
	seedVariantNewVersion,
} from "../utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: omit + top-level unlinks every variant version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_unl_all");
		const variantId = uniqueTestId("cv2_var_unl_all_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({ autumn: autumnV2_3, baseId, variantId });
			await seedVariantNewVersion({ autumn: autumnV2_3, variantId });

			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: baseId, variants: [] },
					{ plan_id: variantId },
				],
			});

			await expectVariantUnlinkedCorrect({
				ctx,
				variantPlanId: variantId,
				versions: [1, 2],
			});
			// Content untouched by the unlink itself.
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: variantId,
				allowances: { [TestFeature.Messages]: 200 },
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: omission or top-level edit alone stays linked")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_unl_keep");
		const variantId = uniqueTestId("cv2_var_unl_keep_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({ autumn: autumnV2_3, baseId, variantId });

			// Omitted from variants[] but NOT declared top-level → no unlink.
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: baseId, variants: [] }],
			});
			await expectVariantPointerCorrect({
				ctx,
				variantPlanId: variantId,
				basePlanId: baseId,
			});

			// Top-level edit without the base in the call → no unlink.
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: variantId, name: "Team EU Renamed" }],
			});
			await expectVariantPointerCorrect({
				ctx,
				variantPlanId: variantId,
				basePlanId: baseId,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: unlinked variant stops following base edits")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_unl_fol");
		const variantId = uniqueTestId("cv2_var_unl_fol_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({ autumn: autumnV2_3, baseId, variantId });

			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: baseId, variants: [] },
					{ plan_id: variantId },
				],
			});
			await expectVariantUnlinkedCorrect({
				ctx,
				variantPlanId: variantId,
				versions: [1],
			});

			// Base gains Dashboard; the ex-variant must not receive it.
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						items: [
							messagesItem(100),
							{ feature_id: TestFeature.Dashboard },
						],
					},
				],
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: variantId,
				featureIds: [TestFeature.Messages],
				allowances: { [TestFeature.Messages]: 200 },
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: base_variant_id null on the variant detaches every version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_unl_flag");
		const variantId = uniqueTestId("cv2_var_unl_flag_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({ autumn: autumnV2_3, baseId, variantId });
			await seedVariantNewVersion({ autumn: autumnV2_3, variantId });

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: variantId, base_variant_id: null }],
			});

			await expectVariantUnlinkedCorrect({
				ctx,
				variantPlanId: variantId,
				versions: [1, 2],
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: variantId,
				allowances: { [TestFeature.Messages]: 200 },
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: nested base_variant_id null detaches every version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_unl_nest");
		const variantId = uniqueTestId("cv2_var_unl_nest_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({ autumn: autumnV2_3, baseId, variantId });
			await seedVariantNewVersion({ autumn: autumnV2_3, variantId });

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						variants: [
							{ variant_plan_id: variantId, base_variant_id: null },
						],
					},
				],
			});

			await expectVariantUnlinkedCorrect({
				ctx,
				variantPlanId: variantId,
				versions: [1, 2],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);
