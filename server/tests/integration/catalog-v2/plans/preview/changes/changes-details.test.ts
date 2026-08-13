/**
 * catalogV2.preview_update — previous_attributes for plan detail fields.
 *
 * RED: buildUpsertProductsPreview stubs changes: null. Spec asserts
 * previous_attributes holds old values for exactly the changed keys;
 * customize null; item_changes empty; no price_change.
 *
 * Ambiguity: diffPlanV1PreviousAttributes keys today are id/name/description/
 * group/add_on/auto_enable/free_trial/config/billing_controls — not archived
 * or metadata. CASES wants those too; tests assert the CASES contract.
 */

import { test } from "bun:test";
import { PreviewUpdateCatalogResponseSchema } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import {
	deleteDbPlans,
	expectCatalogPlansCorrect,
} from "../../utils/expectCatalogPlans.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../utils/expectPlanPreview.js";

const assertDetailChange = async ({
	planId,
	seed,
	params,
	previousAttributes,
	autumn,
	ctx,
}: {
	planId: string;
	seed: Record<string, unknown>;
	params: Record<string, unknown>;
	previousAttributes: Record<string, unknown>;
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
}) => {
	await autumn.catalogV2.update({
		plans: [{ plan_id: planId, ...seed }],
	});
	const preview = parsePlanPreview(
		await autumn.catalogV2.previewUpdate({
			plans: [{ plan_id: planId, ...params }],
		}),
	);
	PreviewUpdateCatalogResponseSchema.parse(preview);
	expectPlanPreviewRowCorrect({
		preview,
		expected: {
			planId,
			action: "update",
			previousAttributes,
			customize: null,
			itemChanges: [],
			priceChange: null,
		},
	});
	// Preview must not persist the change — seed values still win.
	await expectCatalogPlansCorrect({
		autumn,
		expected: [
			{
				id: planId,
				...(typeof seed.name === "string" ? { name: seed.name } : {}),
			},
		],
	});
	void ctx;
};

// RED: changes stubbed null
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 changes-details: name → previous_attributes.name")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_cd_name");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await assertDetailChange({
				planId,
				seed: { name: "Old Name" },
				params: { name: "New Name" },
				previousAttributes: { name: "Old Name" },
				autumn: autumnV2_3,
				ctx,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 changes-details: description / group / add_on individually")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planDesc = uniqueTestId("cv2_cd_desc");
		const planGroup = uniqueTestId("cv2_cd_grp");
		const planAddon = uniqueTestId("cv2_cd_addon");
		await deleteDbPlans({
			ctx,
			planIds: [planDesc, planGroup, planAddon],
		});
		try {
			await assertDetailChange({
				planId: planDesc,
				seed: { name: "D", description: "old desc" },
				params: { description: "new desc" },
				previousAttributes: { description: "old desc" },
				autumn: autumnV2_3,
				ctx,
			});
			await assertDetailChange({
				planId: planGroup,
				seed: { name: "G", group: "g_old" },
				params: { group: "g_new" },
				previousAttributes: { group: "g_old" },
				autumn: autumnV2_3,
				ctx,
			});
			await assertDetailChange({
				planId: planAddon,
				seed: { name: "A", add_on: false },
				params: { add_on: true },
				previousAttributes: { add_on: false },
				autumn: autumnV2_3,
				ctx,
			});
		} finally {
			await deleteDbPlans({
				ctx,
				planIds: [planDesc, planGroup, planAddon],
			});
		}
	},
);

// RED — CASES allows is_default or auto_enable key; assert auto_enable (ApiPlanV1 field)
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 changes-details: auto_enable flip → previous auto_enable")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_cd_ae");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await assertDetailChange({
				planId,
				seed: {
					name: "Defaultable",
					auto_enable: false,
					items: [{ feature_id: TestFeature.Dashboard }],
				},
				params: { auto_enable: true },
				previousAttributes: { auto_enable: false },
				autumn: autumnV2_3,
				ctx,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED — archived not in diffPlanV1PreviousAttributes today; CASES wants it
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 changes-details: archived flip → previous value")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_cd_arch");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await assertDetailChange({
				planId,
				seed: { name: "Arch", archived: false },
				params: { archived: true },
				previousAttributes: { archived: false },
				autumn: autumnV2_3,
				ctx,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED — metadata not in diffPlanV1PreviousAttributes today; CASES wants it
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 changes-details: metadata → previous metadata object")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_cd_meta");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await assertDetailChange({
				planId,
				seed: { name: "Meta", metadata: { a: "1" } },
				params: { metadata: { a: "2" } },
				previousAttributes: { metadata: { a: "1" } },
				autumn: autumnV2_3,
				ctx,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED — billing_controls previous value exposed nested (API shape), not per column
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 changes-details: billing_controls change → previous billing_controls")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_cd_bc");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await assertDetailChange({
				planId,
				seed: {
					name: "BC",
					billing_controls: {
						overage_allowed: [
							{ feature_id: TestFeature.Messages, enabled: true },
						],
					},
				},
				params: {
					billing_controls: {
						overage_allowed: [
							{ feature_id: TestFeature.Messages, enabled: false },
						],
					},
				},
				previousAttributes: {
					billing_controls: {
						overage_allowed: [
							{ feature_id: TestFeature.Messages, enabled: true },
						],
					},
				},
				autumn: autumnV2_3,
				ctx,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 changes-details: config.ignore_past_due flip")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_cd_cfg");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await assertDetailChange({
				planId,
				seed: { name: "Cfg", config: { ignore_past_due: false } },
				params: { config: { ignore_past_due: true } },
				previousAttributes: { config: { ignore_past_due: false } },
				autumn: autumnV2_3,
				ctx,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 changes-details: multi-detail → only changed keys")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_cd_multi");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await assertDetailChange({
				planId,
				seed: {
					name: "Multi",
					description: "d1",
					group: "g1",
					add_on: false,
				},
				params: {
					name: "Multi2",
					description: "d2",
					group: "g1",
					add_on: false,
				},
				previousAttributes: {
					name: "Multi",
					description: "d1",
				},
				autumn: autumnV2_3,
				ctx,
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED — setting field to current value must not appear in previous_attributes
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 changes-details: explicit same value → absent from previous_attributes")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_cd_same");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Same",
						description: "keep",
					},
				],
			});
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							name: "Changed",
							description: "keep",
						},
					],
				}),
			);
			PreviewUpdateCatalogResponseSchema.parse(preview);
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId,
					action: "update",
					previousAttributes: { name: "Same" },
					customize: null,
					itemChanges: [],
					priceChange: null,
				},
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [{ id: planId, name: "Same", description: "keep" }],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
