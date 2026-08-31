/**
 * catalogV2.update — preview conflicts never block or omit a variant draft.
 *
 * Contract:
 *   follow 100→150 vs 200 lists value_divergence; from-grant splits the ops
 *   follow + declare 300 → two ops (150 vs 300); explicit swallows the list
 *   license follow 100→150 vs 200 stamps license_plan_id; from-grant splits
 *   license follow + declare 300 → two upsert_licenses ops (150 vs 300)
 *   pin lists the clash and still omits the variant op
 *   license pin lists license_plan_id and omits the variant license op
 *   both lanes: plan-body + Seat clash → two item ops + two license ops
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { seedVersionableCustomer } from "../utils/seedVersionableCustomer.js";
import {
	childItemOp,
	expectLicenseDraftCase,
	messagesItemDelta,
	orVersionPinnedFilter,
	parentLicenseOp,
	versionPinnedFilter,
} from "../licenses/utils/expectLicenseMigrationDrafts.js";
import {
	messagesItem,
	messagesOverride,
	withCatalogPlans,
} from "../../licenses/utils/seedLicensePlans.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../../preview/utils/expectPlanPreview.js";
import {
	seedBaseVariantWithChildLicense,
	seedBaseWithVariant,
} from "../../variants/utils/seedVariantPlans.js";

const messagesValueDivergence = {
	reason: "value_divergence" as const,
	feature_name: "Messages",
	item_filter: { feature_id: TestFeature.Messages },
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants drafts: follow overwrite lists the conflict and drafts 150")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_dr_cf_item");
		const variantId = uniqueTestId("cv2_var_dr_cf_item_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await seedVersionableCustomer({ ctx, planId: baseId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });

				const plans = [
					{
						plan_id: baseId,
						items: [messagesItem(150)],
						propagate: { variants: [{ plan_id: variantId, version: 1 }] },
						migration: { draft: true },
					},
				];
				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({ plans }),
				);
				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: baseId,
						variants: [
							{
								planId: variantId,
								variantAction: "propagated",
								conflicts: [messagesValueDivergence],
							},
						],
					},
				});

				const baseFilter = versionPinnedFilter({ planId: baseId });
				const variantFilter = versionPinnedFilter({ planId: variantId });
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans,
					responsePlans: [
						[
							{ plan_id: baseId, versions: [1] },
							{ plan_id: variantId, versions: [1] },
						],
					],
					expected: [
						{
							planIds: [baseId, variantId],
							noBillingChanges: true,
							filter: {
								customer: {
									plan: orVersionPinnedFilter({
										branches: [{ planId: baseId }, { planId: variantId }],
									}),
								},
							},
							operations: [
								childItemOp({
									planFilter: baseFilter,
									customize: messagesItemDelta({
										included: 150,
										fromIncluded: 100,
									}),
								}),
								childItemOp({
									planFilter: variantFilter,
									customize: messagesItemDelta({
										included: 150,
										fromIncluded: 200,
									}),
								}),
							],
						},
					],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants drafts: follow + declare 300 splits the ops")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_dr_cf_dec");
		const variantId = uniqueTestId("cv2_var_dr_cf_dec_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await seedVersionableCustomer({ ctx, planId: baseId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });

				const plans = [
					{
						plan_id: baseId,
						items: [messagesItem(150)],
						variants: [
							{
								variant_plan_id: variantId,
								customize: {
									remove_items: [{ feature_id: TestFeature.Messages }],
									add_items: [messagesItem(300)],
								},
							},
						],
						propagate: { variants: [{ plan_id: variantId, version: 1 }] },
						migration: { draft: true },
					},
				];
				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({ plans }),
				);
				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: baseId,
						variants: [
							{
								planId: variantId,
								variantAction: "explicit",
								conflicts: null,
							},
						],
					},
				});

				const baseFilter = versionPinnedFilter({ planId: baseId });
				const variantFilter = versionPinnedFilter({ planId: variantId });
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans,
					responsePlans: [
						[
							{ plan_id: baseId, versions: [1] },
							{ plan_id: variantId, versions: [1] },
						],
					],
					expected: [
						{
							planIds: [baseId, variantId],
							noBillingChanges: true,
							filter: {
								customer: {
									plan: orVersionPinnedFilter({
										branches: [{ planId: baseId }, { planId: variantId }],
									}),
								},
							},
							operations: [
								childItemOp({
									planFilter: baseFilter,
									customize: messagesItemDelta({
										included: 150,
										fromIncluded: 100,
									}),
								}),
								childItemOp({
									planFilter: variantFilter,
									customize: messagesItemDelta({
										included: 300,
										fromIncluded: 200,
									}),
								}),
							],
						},
					],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants drafts: license overwrite lists license_plan_id and drafts 150")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_dr_cf_lic");
		const variantId = uniqueTestId("cv2_var_dr_cf_lic_eu");
		const childId = uniqueTestId("cv2_var_dr_cf_lic_seat");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId, childId],
			run: async () => {
				await seedBaseVariantWithChildLicense({
					autumn: autumnV2_3,
					baseId,
					variantId,
					childId,
				});
				await seedVersionableCustomer({ ctx, planId: baseId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });

				const plans = [
					{
						plan_id: baseId,
						licenses: [
							{
								license_plan_id: childId,
								included: 2,
								customize: messagesOverride(150),
							},
						],
						propagate: { variants: [{ plan_id: variantId, version: 1 }] },
						migration: { draft: true },
					},
				];
				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({ plans }),
				);
				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: baseId,
						variants: [
							{
								planId: variantId,
								variantAction: "propagated",
								conflicts: [
									{
										...messagesValueDivergence,
										license_plan_id: childId,
									},
								],
							},
						],
					},
				});

				const baseFilter = versionPinnedFilter({ planId: baseId });
				const variantFilter = versionPinnedFilter({ planId: variantId });
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans,
					responsePlans: [
						[
							{ plan_id: baseId, versions: [1] },
							{ plan_id: variantId, versions: [1] },
						],
					],
					expected: [
						{
							planIds: [baseId, variantId],
							omitPlanIds: [childId],
							noBillingChanges: true,
							filter: {
								customer: {
									plan: orVersionPinnedFilter({
										branches: [{ planId: baseId }, { planId: variantId }],
									}),
								},
							},
							operations: [
								parentLicenseOp({
									planFilter: baseFilter,
									childId,
									customize: messagesItemDelta({
										included: 150,
										fromIncluded: 100,
									}),
								}),
								parentLicenseOp({
									planFilter: variantFilter,
									childId,
									customize: messagesItemDelta({
										included: 150,
										fromIncluded: 200,
									}),
								}),
							],
						},
					],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants drafts: pin lists the conflict and omits the variant op")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_dr_cf_pin");
		const variantId = uniqueTestId("cv2_var_dr_cf_pin_eu");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId],
			run: async () => {
				await seedBaseWithVariant({
					autumn: autumnV2_3,
					baseId,
					variantId,
				});
				await seedVersionableCustomer({ ctx, planId: baseId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });

				const plans = [
					{
						plan_id: baseId,
						items: [messagesItem(150)],
						migration: { draft: true },
					},
				];
				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({ plans }),
				);
				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: baseId,
						variants: [
							{
								planId: variantId,
								variantAction: "unchanged",
								conflicts: [messagesValueDivergence],
							},
						],
					},
				});

				const baseFilter = versionPinnedFilter({ planId: baseId });
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans,
					responsePlans: [[{ plan_id: baseId, versions: [1] }]],
					expected: [
						{
							planIds: [baseId],
							omitPlanIds: [variantId],
							noBillingChanges: true,
							filter: { customer: { plan: baseFilter } },
							operations: [
								childItemOp({
									planFilter: baseFilter,
									customize: messagesItemDelta({
										included: 150,
										fromIncluded: 100,
									}),
								}),
							],
						},
					],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants drafts: license follow + declare 300 splits the license ops")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_dr_cf_lic_dec");
		const variantId = uniqueTestId("cv2_var_dr_cf_lic_dec_eu");
		const childId = uniqueTestId("cv2_var_dr_cf_lic_dec_seat");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId, childId],
			run: async () => {
				await seedBaseVariantWithChildLicense({
					autumn: autumnV2_3,
					baseId,
					variantId,
					childId,
				});
				await seedVersionableCustomer({ ctx, planId: baseId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });

				const plans = [
					{
						plan_id: baseId,
						licenses: [
							{
								license_plan_id: childId,
								included: 2,
								customize: messagesOverride(150),
							},
						],
						variants: [
							{
								variant_plan_id: variantId,
								customize: {
									upsert_licenses: [
										{
											license_plan_id: childId,
											customize: messagesOverride(300),
										},
									],
								},
							},
						],
						propagate: { variants: [{ plan_id: variantId, version: 1 }] },
						migration: { draft: true },
					},
				];
				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({ plans }),
				);
				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: baseId,
						variants: [
							{
								planId: variantId,
								variantAction: "explicit",
								conflicts: null,
							},
						],
					},
				});

				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans,
					responsePlans: [
						[
							{ plan_id: baseId, versions: [1] },
							{ plan_id: variantId, versions: [1] },
						],
					],
					expected: [
						{
							planIds: [baseId, variantId],
							omitPlanIds: [childId],
							noBillingChanges: true,
							filter: {
								customer: {
									plan: orVersionPinnedFilter({
										branches: [{ planId: baseId }, { planId: variantId }],
									}),
								},
							},
							operations: [
								parentLicenseOp({
									planFilter: versionPinnedFilter({ planId: baseId }),
									childId,
									customize: messagesItemDelta({
										included: 150,
										fromIncluded: 100,
									}),
								}),
								parentLicenseOp({
									planFilter: versionPinnedFilter({ planId: variantId }),
									childId,
									customize: messagesItemDelta({
										included: 300,
										fromIncluded: 200,
									}),
								}),
							],
						},
					],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants drafts: license pin lists license_plan_id and omits the variant op")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_dr_cf_lic_pin");
		const variantId = uniqueTestId("cv2_var_dr_cf_lic_pin_eu");
		const childId = uniqueTestId("cv2_var_dr_cf_lic_pin_seat");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId, childId],
			run: async () => {
				await seedBaseVariantWithChildLicense({
					autumn: autumnV2_3,
					baseId,
					variantId,
					childId,
				});
				await seedVersionableCustomer({ ctx, planId: baseId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });

				const plans = [
					{
						plan_id: baseId,
						licenses: [
							{
								license_plan_id: childId,
								included: 2,
								customize: messagesOverride(150),
							},
						],
						migration: { draft: true },
					},
				];
				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({ plans }),
				);
				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: baseId,
						variants: [
							{
								planId: variantId,
								variantAction: "unchanged",
								conflicts: [
									{
										...messagesValueDivergence,
										license_plan_id: childId,
									},
								],
							},
						],
					},
				});

				const baseFilter = versionPinnedFilter({ planId: baseId });
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans,
					responsePlans: [[{ plan_id: baseId, versions: [1] }]],
					expected: [
						{
							planIds: [baseId],
							omitPlanIds: [variantId, childId],
							noBillingChanges: true,
							filter: { customer: { plan: baseFilter } },
							operations: [
								parentLicenseOp({
									planFilter: baseFilter,
									childId,
									customize: messagesItemDelta({
										included: 150,
										fromIncluded: 100,
									}),
								}),
							],
						},
					],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants drafts: both lanes draft two item ops and two license ops")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_dr_cf_both");
		const variantId = uniqueTestId("cv2_var_dr_cf_both_eu");
		const childId = uniqueTestId("cv2_var_dr_cf_both_seat");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId, childId],
			run: async () => {
				await seedBaseVariantWithChildLicense({
					autumn: autumnV2_3,
					baseId,
					variantId,
					childId,
				});
				await seedVersionableCustomer({ ctx, planId: baseId, version: 1 });
				await seedVersionableCustomer({ ctx, planId: variantId, version: 1 });

				const plans = [
					{
						plan_id: baseId,
						items: [messagesItem(150)],
						licenses: [
							{
								license_plan_id: childId,
								included: 2,
								customize: messagesOverride(150),
							},
						],
						propagate: { variants: [{ plan_id: variantId, version: 1 }] },
						migration: { draft: true },
					},
				];
				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({ plans }),
				);
				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: baseId,
						variants: [
							{
								planId: variantId,
								variantAction: "propagated",
								conflicts: [
									messagesValueDivergence,
									{
										...messagesValueDivergence,
										license_plan_id: childId,
									},
								],
							},
						],
					},
				});

				const baseFilter = versionPinnedFilter({ planId: baseId });
				const variantFilter = versionPinnedFilter({ planId: variantId });
				await expectLicenseDraftCase({
					autumn: autumnV2_3,
					ctx,
					plans,
					responsePlans: [
						[
							{ plan_id: baseId, versions: [1] },
							{ plan_id: variantId, versions: [1] },
						],
					],
					expected: [
						{
							planIds: [baseId, variantId],
							omitPlanIds: [childId],
							noBillingChanges: true,
							filter: {
								customer: {
									plan: orVersionPinnedFilter({
										branches: [{ planId: baseId }, { planId: variantId }],
									}),
								},
							},
							operations: [
								childItemOp({
									planFilter: baseFilter,
									customize: messagesItemDelta({
										included: 150,
										fromIncluded: 100,
									}),
								}),
								childItemOp({
									planFilter: variantFilter,
									customize: messagesItemDelta({
										included: 150,
										fromIncluded: 200,
									}),
								}),
								parentLicenseOp({
									planFilter: baseFilter,
									childId,
									customize: messagesItemDelta({
										included: 150,
										fromIncluded: 100,
									}),
								}),
								parentLicenseOp({
									planFilter: variantFilter,
									childId,
									customize: messagesItemDelta({
										included: 150,
										fromIncluded: 200,
									}),
								}),
							],
						},
					],
				});
			},
		});
	},
);
