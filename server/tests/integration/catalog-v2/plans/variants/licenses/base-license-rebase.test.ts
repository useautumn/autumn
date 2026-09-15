/**
 * catalogV2.update — Team-EU licenses[seat].customize is a patch on Seat,
 * not a stack of Team's overlay. Follow replays Team's Seat current→next
 * onto Team-EU's Seat effective.
 *
 * Red (current):  copy / miss price / unlink on licenses: []
 * Green (after):  200 stays when adding Dashboard; price applyDiff; never unlink
 */

import { test } from "bun:test";
import { BillingInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { expectLicenseLinkCorrect } from "../../licenses/utils/expectLicenseLinkCorrect.js";
import {
	bumpChild,
	dashboardItem,
	messagesItem,
	messagesOverride,
	withCatalogPlans,
} from "../../licenses/utils/seedLicensePlans.js";
import {
	seedBaseVariantWithChildLicense,
	seedVariantNewVersion,
} from "../utils/seedVariantPlans.js";

const monthPrice = (amount: number) => ({
	amount,
	interval: BillingInterval.Month,
});

const seedStockVariantVersionsOnChildV1 = async ({
	autumn,
	baseId,
	variantId,
	childId,
}: {
	autumn: AutumnInt;
	baseId: string;
	variantId: string;
	childId: string;
}) => {
	await seedBaseVariantWithChildLicense({
		autumn,
		baseId,
		variantId,
		childId,
		customizeLicenses: false,
	});
	await seedVariantNewVersion({ autumn, variantId });
	await bumpChild({
		autumn,
		childId,
		items: [messagesItem(20)],
		versioning: "new_version",
	});
};

const contentOnlyVariantCustomize = (messages: number) => ({
	remove_items: [{ feature_id: TestFeature.Messages }],
	add_items: [messagesItem(messages)],
});

const statedVariantVersions = (variantId: string) => [
	{
		variant_plan_id: variantId,
		version: 1,
		customize: contentOnlyVariantCustomize(200),
	},
	{
		variant_plan_id: variantId,
		version: 2,
		customize: contentOnlyVariantCustomize(200),
	},
];

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants licenses: stated content-only variants adopt the base's declared child version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_reb_anchor");
		const variantId = uniqueTestId("cv2_var_reb_anchor_eu");
		const childId = uniqueTestId("cv2_var_reb_anchor_seat");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId, childId],
			run: async () => {
				await seedStockVariantVersionsOnChildV1({
					autumn: autumnV2_3,
					baseId,
					variantId,
					childId,
				});

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							version: 1,
							licenses: [
								{
									license_plan_id: childId,
									version_slug: "v2",
									included: 2,
									customize: null,
								},
							],
							variants: statedVariantVersions(variantId),
						},
					],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: baseId,
					licensePlanId: childId,
					licenseVersion: 2,
					messagesAllowance: 20,
					customized: false,
				});
				for (const parentVersion of [1, 2]) {
					await expectLicenseLinkCorrect({
						ctx,
						parentPlanId: variantId,
						parentVersion,
						licensePlanId: childId,
						licenseVersion: 2,
						messagesAllowance: 20,
						customized: false,
					});
				}
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants licenses: stated content-only variants adopt the base's declared license customize")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_reb_liccus");
		const variantId = uniqueTestId("cv2_var_reb_liccus_eu");
		const childId = uniqueTestId("cv2_var_reb_liccus_seat");
		await withCatalogPlans({
			ctx,
			planIds: [baseId, variantId, childId],
			run: async () => {
				await seedStockVariantVersionsOnChildV1({
					autumn: autumnV2_3,
					baseId,
					variantId,
					childId,
				});

				await autumnV2_3.catalogV2.update({
					plans: [
						{
							plan_id: baseId,
							version: 1,
							licenses: [
								{
									license_plan_id: childId,
									version_slug: "v1",
									included: 2,
									customize: messagesOverride(30),
								},
							],
							variants: statedVariantVersions(variantId),
						},
					],
				});

				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: baseId,
					licensePlanId: childId,
					licenseVersion: 1,
					messagesAllowance: 30,
					customized: true,
				});
				for (const parentVersion of [1, 2]) {
					await expectLicenseLinkCorrect({
						ctx,
						parentPlanId: variantId,
						parentVersion,
						licensePlanId: childId,
						licenseVersion: 1,
						messagesAllowance: 30,
						customized: true,
					});
				}
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants licenses: follow add Dashboard keeps 200 — not Team's 100")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_reb_dash");
		const variantId = uniqueTestId("cv2_var_reb_dash_eu");
		const childId = uniqueTestId("cv2_var_reb_dash_seat");
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
										remove_items: [{ feature_id: TestFeature.Messages }],
										add_items: [messagesItem(100), dashboardItem()],
									},
								},
							],
							propagate: { variants: [{ plan_id: variantId, version: 1 }] },
						},
					],
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: baseId,
					licensePlanId: childId,
					messagesAllowance: 100,
					entitlements: [{ feature_id: TestFeature.Dashboard }],
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: variantId,
					licensePlanId: childId,
					customized: true,
					messagesAllowance: 200,
					entitlements: [{ feature_id: TestFeature.Dashboard }],
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants licenses: follow price $20→$30 overwrites EU $50")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_reb_price");
		const variantId = uniqueTestId("cv2_var_reb_price_eu");
		const childId = uniqueTestId("cv2_var_reb_price_seat");
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
					],
				});
				await autumnV2_3.catalogV2.update({
					plans: [
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
										price: monthPrice(30),
									},
								},
							],
							propagate: { variants: [{ plan_id: variantId, version: 1 }] },
						},
					],
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: variantId,
					licensePlanId: childId,
					messagesAllowance: 200,
					price: monthPrice(30),
				});
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants licenses: Team licenses [] + follow does not unlink EU Seat")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_reb_empty");
		const variantId = uniqueTestId("cv2_var_reb_empty_eu");
		const childId = uniqueTestId("cv2_var_reb_empty_seat");
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
							licenses: [],
							propagate: { variants: [{ plan_id: variantId, version: 1 }] },
						},
					],
				});
				await expectLicenseLinkCorrect({
					ctx,
					parentPlanId: variantId,
					licensePlanId: childId,
					messagesAllowance: 200,
				});
			},
		});
	},
);
