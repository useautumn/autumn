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
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { messagesItem } from "../../licenses/utils/seedLicensePlans.js";
import { deleteDbPlans } from "../../utils/expectCatalogPlans.js";
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
						variants: [{ variant_plan_id: variantId, version: 1 }],
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
						variants: [{ variant_plan_id: variantId, version: 1 }],
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
								variants: [{ variant_plan_id: parentId, version: 1 }],
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
	`${chalk.yellowBright("catalogV2 variants: enumerated nested versions link under one pinned base row")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_link_enum");
		const variantId = uniqueTestId("cv2_var_link_enum_eu");
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
						version: 1,
						variants: [
							{ variant_plan_id: variantId, version: 1 },
							{ variant_plan_id: variantId, version: 2 },
						],
					},
				],
			});

			for (const variantVersion of [1, 2]) {
				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: variantId,
					basePlanId: baseId,
					baseVersion: 1,
					variantVersion,
				});
			}
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: linking one of two standalone versions is rejected")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_link_part");
		const variantId = uniqueTestId("cv2_var_link_part_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: baseId, name: "Team", items: [messagesItem(100)] },
					{ plan_id: variantId, name: "EU", items: [messagesItem(50)] },
				],
			});
			await seedVariantNewVersion({ autumn: autumnV2_3, variantId });

			const partial = {
				plans: [
					{
						plan_id: baseId,
						variants: [{ variant_plan_id: variantId, version: 2 }],
					},
				],
			};
			for (const func of [
				() => autumnV2_3.catalogV2.previewUpdate(partial),
				() => autumnV2_3.catalogV2.update(partial),
			]) {
				await expectAutumnError({
					errCode: ErrCode.VariantCrossPlanAnchor,
					errMessage: `All versions of ${variantId} must share one base plan or all be standalone`,
					func,
				});
			}
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: enumerated versions reparent from base v1 to base v2 in one full-state push")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({
			setup: [s.platform.create({ setupDefaultFeatures: true })],
			actions: [],
		});
		const baseId = uniqueTestId("cv2_var_rep_ver");
		const variantId = uniqueTestId("cv2_var_rep_ver_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({ autumn: autumnV2_3, baseId, variantId });
			await seedVariantNewVersion({ autumn: autumnV2_3, variantId });
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: baseId, versioning: "new_version", active: true }],
			});
			for (const variantVersion of [1, 2]) {
				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: variantId,
					basePlanId: baseId,
					baseVersion: 1,
					variantVersion,
				});
			}

			// The config's whole picture: v2 owns both EU rows, v1 declares none.
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						version: 2,
						variants: [
							{ variant_plan_id: variantId, version: 1 },
							{ variant_plan_id: variantId, version: 2 },
						],
					},
					{ plan_id: baseId, version: 1, variants: [] },
				],
				skip_deletions: false,
			});

			for (const variantVersion of [1, 2]) {
				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: variantId,
					basePlanId: baseId,
					baseVersion: 2,
					variantVersion,
				});
			}
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: enumerated versions reparent to another pinned base")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_rep_a");
		const otherBaseId = uniqueTestId("cv2_var_rep_b");
		const variantId = uniqueTestId("cv2_var_rep_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, otherBaseId, variantId] });
		try {
			await seedBaseWithVariant({ autumn: autumnV2_3, baseId, variantId });
			await seedVariantNewVersion({ autumn: autumnV2_3, variantId });
			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: otherBaseId, name: "Team B", items: [messagesItem(100)] },
				],
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: otherBaseId,
						version: 1,
						variants: [
							{ variant_plan_id: variantId, version: 1 },
							{ variant_plan_id: variantId, version: 2 },
						],
					},
				],
			});

			for (const variantVersion of [1, 2]) {
				await expectVariantPointerCorrect({
					ctx,
					variantPlanId: variantId,
					basePlanId: otherBaseId,
					baseVersion: 1,
					variantVersion,
				});
			}
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, otherBaseId, variantId] });
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
