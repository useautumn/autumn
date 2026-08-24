/**
 * catalogV2 version identity — `new_version_slug` on propagate targets.
 *
 * Contract:
 *   `propagate.variants[].new_version_slug` names that variant's minted row
 *   a base slug never reaches a target — an unnamed target falls back to `v{n}`
 *   `variants[].new_version_slug` overrides the propagate target's slug
 *   a target that follows in place → its slug is untouched
 *   variant content drift survives propagation (editDiff, not absolute content)
 *   a target slug another version of that target holds → DuplicateVersionSlug
 *   `propagate.license_parents[].new_version_slug` names the parent's minted row
 */

import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	bumpChild,
	dashboardItem,
	messagesItem,
	seedTwoParentVersions,
	withCatalogPlans,
} from "../licenses/utils/seedLicensePlans.js";
import { seedVersionableCustomer } from "../migrations/utils/seedVersionableCustomer.js";
import { expectVersionIdentityCorrect } from "../utils/expectVersionIdentity.js";
import { expectVariantPlanCorrect } from "../variants/utils/expectVariantPointer.js";
import { seedBaseWithVariant } from "../variants/utils/seedVariantPlans.js";

/** Base mint that adds dashboard and asks the variant to follow. */
const mintBaseWithFollowingVariant = async ({
	autumn,
	baseId,
	variantId,
	baseSlug,
	targetSlug,
	declaredSlug,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	baseId: string;
	variantId: string;
	baseSlug?: string;
	targetSlug?: string;
	declaredSlug?: string;
}) =>
	autumn.catalogV2.update({
		plans: [
			{
				plan_id: baseId,
				items: [messagesItem(100), dashboardItem()],
				versioning: "new_version",
				active: true,
				...(baseSlug ? { new_version_slug: baseSlug } : {}),
				...(declaredSlug
					? {
							variants: [
								{
									variant_plan_id: variantId,
									new_version_slug: declaredSlug,
								},
							],
						}
					: {}),
				propagate: {
					variants: [
						{
							plan_id: variantId,
							...(targetSlug ? { new_version_slug: targetSlug } : {}),
						},
					],
				},
			},
		],
	});

test.concurrent(
	`${chalk.yellowBright("version identity propagate-slug: target slug names the variant mint and keeps its drift")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_vid_pvs");
		const variantId = uniqueTestId("cv2_vid_pvs_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({ autumn: autumnV2_3, baseId, variantId });
				await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });

				await mintBaseWithFollowingVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
					baseSlug: "summer",
					targetSlug: "summer_eu",
				});

				await expectVersionIdentityCorrect({
					ctx,
					planId: variantId,
					version: 1,
					versionSlug: "v1",
				});
				await expectVersionIdentityCorrect({
					ctx,
					planId: variantId,
					version: 2,
					versionSlug: "summer_eu",
				});
				// The variant's 200 messages must survive: propagation applies the
				// base's delta, it does not overwrite with the base's content.
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					version: 2,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [TestFeature.Messages, TestFeature.Dashboard],
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					version: 1,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [TestFeature.Messages],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity propagate-slug: the base slug never reaches an unnamed target")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_vid_pvd");
		const variantId = uniqueTestId("cv2_vid_pvd_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({ autumn: autumnV2_3, baseId, variantId });
				await seedVersionableCustomer({ ctx, planId: baseId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });

				await mintBaseWithFollowingVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
					baseSlug: "summer",
				});

				await expectVersionIdentityCorrect({
					ctx,
					planId: baseId,
					version: 2,
					versionSlug: "summer",
				});
				await expectVersionIdentityCorrect({
					ctx,
					planId: variantId,
					version: 2,
					versionSlug: "v2",
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity propagate-slug: variants[] slug overrides the target slug")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_vid_pvo");
		const variantId = uniqueTestId("cv2_vid_pvo_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({ autumn: autumnV2_3, baseId, variantId });
				await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });

				await mintBaseWithFollowingVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
					targetSlug: "from_target",
					declaredSlug: "from_declared",
				});

				await expectVersionIdentityCorrect({
					ctx,
					planId: variantId,
					version: 2,
					versionSlug: "from_declared",
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity propagate-slug: a target that edits in place keeps its slug")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_vid_pve");
		const variantId = uniqueTestId("cv2_vid_pve_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				// No customers on the variant, so it follows in place instead of minting.
				await seedBaseWithVariant({ autumn: autumnV2_3, baseId, variantId });

				await mintBaseWithFollowingVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
					baseSlug: "summer",
					targetSlug: "summer_eu",
				});

				await expectVersionIdentityCorrect({
					ctx,
					planId: variantId,
					version: 1,
					versionSlug: "v1",
				});
				await expectVariantPlanCorrect({
					ctx,
					variantPlanId: variantId,
					version: 1,
					allowances: { [TestFeature.Messages]: 200 },
					featureIds: [TestFeature.Messages, TestFeature.Dashboard],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity propagate-slug: a target slug that variant already holds errors")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_vid_pvc");
		const variantId = uniqueTestId("cv2_vid_pvc_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({ autumn: autumnV2_3, baseId, variantId });
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: variantId,
							version_slug: "v1",
							new_version_slug: "summer_eu",
						},
					],
				});
				await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });

				await expectAutumnError({
					errCode: ErrCode.DuplicateVersionSlug,
					func: () =>
						mintBaseWithFollowingVariant({
							autumn: autumnV2_3,
							baseId,
							variantId,
							targetSlug: "summer_eu",
						}),
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("version identity propagate-slug: license_parent target slug names the parent mint")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_vid_pls_p");
		const childId = uniqueTestId("cv2_vid_pls_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await seedTwoParentVersions({
					autumn: autumnV2_3,
					parentId,
					childId,
				});
				await seedVersionableCustomer({ ctx, planId: parentId, version: 2 });

				await bumpChild({
					autumn: autumnV2_3,
					childId,
					versioning: "new_version",
					newVersionSlug: "summer",
					propagate: {
						license_parents: [
							{
								plan_id: parentId,
								versioning: "new_version",
								new_version_slug: "summer_parent",
							},
						],
					},
				});

				await expectVersionIdentityCorrect({
					ctx,
					planId: childId,
					version: 2,
					versionSlug: "summer",
				});
				await expectVersionIdentityCorrect({
					ctx,
					planId: parentId,
					version: 3,
					versionSlug: "summer_parent",
				});
				await expectVersionIdentityCorrect({
					ctx,
					planId: parentId,
					version: 2,
					versionSlug: "v2",
				});
			},
		});
	},
);
