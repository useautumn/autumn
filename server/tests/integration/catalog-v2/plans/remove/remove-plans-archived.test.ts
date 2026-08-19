/**
 * catalogV2.update — archived plans stay pinned; settings still fan out;
 * drafts skip archived rows; variants[].archived unarchives.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { cleanupPlanCustomerRefs } from "../utils/cleanupPlanCustomerRefs.js";
import {
	deleteDbPlans,
	expectDbPlansCorrect,
} from "../utils/expectCatalogPlans.js";
import { seedVersionableCustomer } from "../migrations/utils/seedVersionableCustomer.js";
import { expectLicenseLinkCorrect } from "../licenses/utils/expectLicenseLinkCorrect.js";
import {
	messagesItem,
	withCatalogPlans,
} from "../licenses/utils/seedLicensePlans.js";
import { expectVariantPlanCorrect } from "../variants/utils/expectVariantPointer.js";
import { seedBaseWithVariant } from "../variants/utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans: archived parent is omitted from license_parents and stays pinned")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const parentId = uniqueTestId("cv2_rmp_pin_p");
		const childId = uniqueTestId("cv2_rmp_pin_c");
		await withCatalogPlans({
			ctx,
			planIds: [parentId, childId],
			run: async () => {
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							name: "Seat",
							items: [messagesItem(10)],
						},
						{
							plan_id: parentId,
							name: "Team",
							licenses: [{ license_plan_id: childId, included: 1 }],
						},
					],
				});
				await autumnV2_3.catalogV2.update({
					plans: [{ plan_id: parentId, archived: true }],
				});

				const preview = await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(200)],
						},
					],
				});
				const childRow = preview.plans.find(
					(row) => row.plan_id === childId,
				);
				expect(childRow?.license_parents ?? []).toEqual([]);

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: childId,
							items: [messagesItem(200)],
						},
					],
				});
				await expectDbPlansCorrect({
					ctx,
					expected: [
						{ id: parentId, archived: true },
						{ id: childId, allowances: { [TestFeature.Messages]: 200 } },
					],
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: parentId,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 10,
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans: cannot propagate or customize an archived relative")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_rmp_prop_b");
		const variantId = uniqueTestId("cv2_rmp_prop_eu");
		const parentId = uniqueTestId("cv2_rmp_prop_p");
		const childId = uniqueTestId("cv2_rmp_prop_c");
		await deleteDbPlans({
			ctx,
			planIds: [baseId, variantId, parentId, childId],
		});
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: variantId, archived: true }],
			});
			await expectAutumnError({
				errCode: "invalid_propagation_target",
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: baseId,
								items: [messagesItem(150)],
								propagate: { variants: [{ plan_id: variantId }] },
							},
						],
					}),
			});
			await expectAutumnError({
				errMessage: `Cannot customize archived variant ${variantId}`,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: baseId,
								variants: [
									{
										variant_plan_id: variantId,
										customize: {
											add_items: [messagesItem(300)],
										},
									},
								],
							},
						],
					}),
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: childId,
						name: "Seat",
						items: [messagesItem(10)],
					},
					{
						plan_id: parentId,
						name: "Team",
						licenses: [{ license_plan_id: childId, included: 1 }],
					},
				],
			});
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: parentId, archived: true }],
			});
			await expectAutumnError({
				errCode: "invalid_propagation_target",
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: childId,
								items: [messagesItem(200)],
								propagate: {
									license_parents: [{ plan_id: parentId }],
								},
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({
				ctx,
				planIds: [baseId, variantId, parentId, childId],
			});
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans: settings fan out to archived variants; archived:false unarchives; no draft")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_rmp_set_b");
		const variantId = uniqueTestId("cv2_rmp_set_eu");
		const archivedId = uniqueTestId("cv2_rmp_draft");
		await cleanupPlanCustomerRefs({
			ctx,
			planIds: [baseId, variantId, archivedId],
		});
		await deleteDbPlans({ ctx, planIds: [baseId, variantId, archivedId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: variantId, archived: true }],
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						description: "after",
					},
				],
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: variantId,
				name: "Team EU",
				description: "after",
				allowances: { [TestFeature.Messages]: 200 },
			});
			await expectDbPlansCorrect({
				ctx,
				expected: [{ id: variantId, archived: true }],
			});

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						variants: [{ variant_plan_id: variantId, archived: false }],
					},
				],
			});
			await expectDbPlansCorrect({
				ctx,
				expected: [{ id: variantId, archived: false }],
			});

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: archivedId, name: "Draft Me" }],
			});
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: archivedId, archived: true }],
			});
			await seedVersionableCustomer({ ctx, planId: archivedId });
			const response = await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: archivedId,
						name: "Still Archived",
						migration: { draft: true },
					},
				],
			});
			expect(response.migrations ?? []).toEqual([]);
			await expectDbPlansCorrect({
				ctx,
				expected: [{ id: archivedId, name: "Still Archived", archived: true }],
			});
		} finally {
			await cleanupPlanCustomerRefs({
				ctx,
				planIds: [baseId, variantId, archivedId],
			});
			await deleteDbPlans({ ctx, planIds: [baseId, variantId, archivedId] });
		}
	},
);
