/**
 * catalogV2.update — billing_controls always fan out to every latest variant.
 *
 * Contract:
 *   omit from propagate → still copy billing_controls; items stay drifted
 *   sparse lane merge / clear → variant matches base next
 *   two variants → both latest rows get the same controls
 *   historical variant version → unchanged
 */

import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectCatalogResultsCorrect } from "../../../utils/expectCatalogUpdate.js";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	deleteDbPlans,
	expectPlanVersionsCorrect,
} from "../../utils/expectCatalogPlans.js";
import { expectVariantPlanCorrect } from "../utils/expectVariantPointer.js";
import { seedBaseWithVariant } from "../utils/seedVariantPlans.js";

const overageAllowed = [
	{ feature_id: TestFeature.Messages, enabled: true },
];
const autoTopups = [
	{
		feature_id: TestFeature.Messages,
		enabled: true,
		threshold: 10,
		quantity: 100,
	},
];
const spendLimits = [
	{
		feature_id: TestFeature.Messages,
		overage_limit: 50,
		enabled: true,
	},
];
const usageAlerts = [
	{
		feature_id: TestFeature.Messages,
		enabled: true,
		threshold: 80,
		threshold_type: "usage_percentage" as const,
	},
];

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants settings: billing_controls fan out without propagate")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_bc");
		const variantId = uniqueTestId("cv2_var_bc_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			const billingControls = {
				overage_allowed: overageAllowed,
				auto_topups: autoTopups,
			};
			const response = await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: baseId, billing_controls: billingControls }],
			});
			expectCatalogResultsCorrect({
				response,
				plans: [
					{ id: baseId, action: "update" },
					{ id: variantId, action: "update" },
				],
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: variantId,
				name: "Team EU",
				allowances: { [TestFeature.Messages]: 200 },
				featureIds: [TestFeature.Messages],
				billingControls,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants settings: billing_controls sparse merge then clear lane")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_bc_sp");
		const variantId = uniqueTestId("cv2_var_bc_sp_eu");
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
						billing_controls: {
							overage_allowed: overageAllowed,
							spend_limits: spendLimits,
							usage_alerts: usageAlerts,
						},
					},
				],
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						billing_controls: { spend_limits: [] },
					},
				],
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: variantId,
				allowances: { [TestFeature.Messages]: 200 },
				billingControlsExact: {
					overage_allowed: overageAllowed,
					spend_limits: [],
					usage_alerts: usageAlerts,
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants settings: billing_controls hit every latest variant")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_bc_2");
		const euId = uniqueTestId("cv2_var_bc_2_eu");
		const ukId = uniqueTestId("cv2_var_bc_2_uk");
		await deleteDbPlans({ ctx, planIds: [baseId, euId, ukId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId: euId,
			});
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: baseId,
						variants: [{ variant_plan_id: ukId, name: "Team UK" }],
					},
				],
			});
			const billingControls = { overage_allowed: overageAllowed };
			const response = await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: baseId, billing_controls: billingControls }],
			});
			expectCatalogResultsCorrect({
				response,
				plans: [
					{ id: baseId, action: "update" },
					{ id: euId, action: "update" },
					{ id: ukId, action: "update" },
				],
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: euId,
				allowances: { [TestFeature.Messages]: 200 },
				billingControls,
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: ukId,
				allowances: { [TestFeature.Messages]: 100 },
				billingControls,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, euId, ukId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants settings: billing_controls latest version only")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_bc_ver");
		const variantId = uniqueTestId("cv2_var_bc_ver_eu");
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
						plan_id: variantId,
						versioning: "new_version", active: true,
						metadata: { stamp: "v2" },
					},
				],
			});
			const billingControls = { overage_allowed: overageAllowed };
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: baseId, billing_controls: billingControls }],
			});
			await expectPlanVersionsCorrect({
				ctx,
				planId: variantId,
				versions: [1, 2],
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: variantId,
				version: 1,
				billingControlsExact: {},
				allowances: { [TestFeature.Messages]: 200 },
			});
			await expectVariantPlanCorrect({
				ctx,
				variantPlanId: variantId,
				version: 2,
				billingControls,
				allowances: { [TestFeature.Messages]: 200 },
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);
