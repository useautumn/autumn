/**
 * catalogV2.preview_update — license-slot conflicts on a following variant.
 *
 * Team-EU.licenses[seat].customize is a Seat patch. Conflicts compare
 * Team's Seat effective current→next to Team-EU's Seat effective — not
 * Team plan items vs Team-EU plan items.
 *
 * Follow and pin list it with license_plan_id; explicit swallows it.
 */

import { test } from "bun:test";
import { BillingInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../../utils/uniqueTestId.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../../../preview/utils/expectPlanPreview.js";
import {
	messagesOverride,
	withCatalogPlans,
} from "../../../licenses/utils/seedLicensePlans.js";
import { seedBaseVariantWithChildLicense } from "../../utils/seedVariantPlans.js";

const messagesLicenseDivergence = (licensePlanId: string) => ({
	reason: "value_divergence" as const,
	feature_name: "Messages",
	item_filter: { feature_id: TestFeature.Messages },
	license_plan_id: licensePlanId,
});

const monthPrice = (amount: number) => ({
	amount,
	interval: BillingInterval.Month,
});

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants license conflicts: follow 100→150 vs EU 200 lists value_divergence")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_lcf_fol");
		const variantId = uniqueTestId("cv2_var_lcf_fol_eu");
		const childId = uniqueTestId("cv2_var_lcf_fol_seat");
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
				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: baseId,
								licenses: [
									{
										license_plan_id: childId,
										included: 2,
										customize: messagesOverride(150),
									},
								],
								propagate: { variants: [{ plan_id: variantId }] },
							},
						],
					}),
				);
				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: baseId,
						variants: [
							{
								planId: variantId,
								variantAction: "propagated",
								conflicts: [messagesLicenseDivergence(childId)],
								licenseChanges: [
									{
										action: "updated",
										license_plan_id: childId,
									},
								],
							},
						],
					},
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants license conflicts: pin still lists value_divergence")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_lcf_pin");
		const variantId = uniqueTestId("cv2_var_lcf_pin_eu");
		const childId = uniqueTestId("cv2_var_lcf_pin_seat");
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
				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: baseId,
								licenses: [
									{
										license_plan_id: childId,
										included: 2,
										customize: messagesOverride(150),
									},
								],
							},
						],
					}),
				);
				expectPlanPreviewRowCorrect({
					preview,
					expected: {
						planId: baseId,
						variants: [
							{
								planId: variantId,
								variantAction: "unchanged",
								conflicts: [messagesLicenseDivergence(childId)],
							},
						],
					},
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants license conflicts: follow + declare 300 is explicit, no conflict")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_lcf_ex");
		const variantId = uniqueTestId("cv2_var_lcf_ex_eu");
		const childId = uniqueTestId("cv2_var_lcf_ex_seat");
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
				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
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
								propagate: { variants: [{ plan_id: variantId }] },
							},
						],
					}),
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
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants license conflicts: license-only price $20→$30 vs $50 is base_price_divergence")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_lcf_price");
		const variantId = uniqueTestId("cv2_var_lcf_price_eu");
		const childId = uniqueTestId("cv2_var_lcf_price_seat");
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
				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: {
										...messagesOverride(100),
										price: monthPrice(20),
									},
								},
							],
						},
						{
							plan_id: variantId,
							licenses: [
								{
									license_plan_id: childId,
									included: 2,
									customize: {
										...messagesOverride(200),
										price: monthPrice(50),
									},
								},
							],
						},
					],
				});
				const preview = parsePlanPreview(
					await autumnV2_3.catalogV2.previewUpdate({
						plans: [
							{
								plan_id: baseId,
								licenses: [
									{
										license_plan_id: childId,
										included: 2,
										customize: {
											...messagesOverride(100),
											price: monthPrice(30),
										},
									},
								],
								propagate: { variants: [{ plan_id: variantId }] },
							},
						],
					}),
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
										reason: "base_price_divergence",
										license_plan_id: childId,
									},
								],
							},
						],
					},
				});
			},
		});
	},
);
