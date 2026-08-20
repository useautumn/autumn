/**
 * catalogV2.update — link an existing standalone plan as a variant.
 *
 * Signal: nest under `base.variants[]`, or `{ plan_id, base_variant_id }`.
 * Both stamp base_internal_product_id on every version row and keep items.
 * A top-level entry in the same call as the nest is content, not a second
 * home — unlike an already-linked variant, which still 400s.
 */

import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../../utils/expectCatalogPlans.js";
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
	`${chalk.yellowBright("catalogV2 variants: nest existing standalone stamps pointer, keeps items")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_link");
		const variantId = uniqueTestId("cv2_var_link_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						name: "Team",
						items: [messagesItem(100)],
					},
					{
						plan_id: variantId,
						name: "EU",
						items: [messagesItem(50)],
					},
				],
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						variants: [{ variant_plan_id: variantId }],
					},
				],
			});

			await expectVariantPointerCorrect({
				ctx,
				variantPlanId: variantId,
				basePlanId: baseId,
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: variantId,
				name: "EU",
				allowances: { [TestFeature.Messages]: 50 },
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: nest + top-level content links and applies the edit")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_link_both");
		const variantId = uniqueTestId("cv2_var_link_both_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: baseId, name: "Team", items: [messagesItem(100)] },
					{ plan_id: variantId, name: "EU", items: [messagesItem(50)] },
				],
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						variants: [{ variant_plan_id: variantId }],
					},
					{ plan_id: variantId, name: "Team EU" },
				],
			});

			await expectVariantPointerCorrect({
				ctx,
				variantPlanId: variantId,
				basePlanId: baseId,
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: variantId,
				name: "Team EU",
				allowances: { [TestFeature.Messages]: 50 },
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: a plan that already has variants cannot be nested")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_var_link_par");
		const childId = uniqueTestId("cv2_var_link_ch");
		const otherBaseId = uniqueTestId("cv2_var_link_ob");
		await deleteDbPlans({
			ctx,
			planIds: [parentId, childId, otherBaseId],
		});
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId: parentId,
				variantId: childId,
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: otherBaseId, name: "Other", items: [messagesItem(10)] },
				],
			});

			await expectAutumnError({
				errCode: ErrCode.NestedVariantNotAllowed,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: otherBaseId,
								variants: [{ variant_plan_id: parentId }],
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({
				ctx,
				planIds: [parentId, childId, otherBaseId],
			});
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: nest existing standalone links every version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_link_sib");
		const variantId = uniqueTestId("cv2_var_link_sib_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: baseId, name: "Team", items: [messagesItem(100)] },
					{ plan_id: variantId, name: "EU", items: [messagesItem(50)] },
				],
			});
			await seedVariantNewVersion({ autumn: autumnV2_3, variantId });

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						variants: [{ variant_plan_id: variantId }],
					},
				],
			});

			await expectVariantPointerCorrect({
				ctx,
				variantPlanId: variantId,
				basePlanId: baseId,
				variantVersion: 1,
			});
			await expectVariantPointerCorrect({
				ctx,
				variantPlanId: variantId,
				basePlanId: baseId,
				variantVersion: 2,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: direct base_variant_id links every version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_link_dir");
		const variantId = uniqueTestId("cv2_var_link_dir_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: baseId, name: "Team", items: [messagesItem(100)] },
					{ plan_id: variantId, name: "EU", items: [messagesItem(50)] },
				],
			});
			await seedVariantNewVersion({ autumn: autumnV2_3, variantId });

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: variantId, base_variant_id: baseId }],
			});

			await expectVariantPointerCorrect({
				ctx,
				variantPlanId: variantId,
				basePlanId: baseId,
				variantVersion: 1,
			});
			await expectVariantPointerCorrect({
				ctx,
				variantPlanId: variantId,
				basePlanId: baseId,
				variantVersion: 2,
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: variantId,
				allowances: { [TestFeature.Messages]: 50 },
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);
