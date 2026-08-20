/**
 * catalogV2.update — variant create guards.
 *
 * Contract:
 *   - variant of a variant → nested_variant_not_allowed
 *   - occupied id that is not this base's variant → product_id_already_exists
 *   - new id without name → 400
 *   - is_default on a variant → variant_cannot_be_default
 *   - variant_plan_id === plan_id → 400
 *   - duplicate variant_plan_id → 400
 *   - listed in variants[] and as a top-level plan → 400
 */

import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../../utils/expectCatalogPlans.js";
import { messagesItem } from "../../licenses/utils/seedLicensePlans.js";

const seedBaseAndVariant = async ({
	autumnV2_3,
	baseId,
	variantId,
}: {
	autumnV2_3: { catalogV2: { update: (params: unknown) => Promise<unknown> } };
	baseId: string;
	variantId: string;
}) => {
	await autumnV2_3.catalogV2.update({
		plans: [
			{
				plan_id: baseId,
				name: "Team",
				items: [messagesItem(10)],
				variants: [{ variant_plan_id: variantId, name: "Team EU" }],
			},
		],
	});
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants create: nested variant → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_nest_b");
		const variantId = uniqueTestId("cv2_var_nest_v");
		const nestedId = uniqueTestId("cv2_var_nest_n");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId, nestedId] });
		try {
			await seedBaseAndVariant({ autumnV2_3, baseId, variantId });
			await expectAutumnError({
				errCode: ErrCode.NestedVariantNotAllowed,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: variantId,
								variants: [{ variant_plan_id: nestedId, name: "Nested" }],
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId, nestedId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants create: occupied id → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_id_b");
		const takenId = uniqueTestId("cv2_var_id_taken");
		await deleteDbPlans({ ctx, planIds: [baseId, takenId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: baseId, name: "Team", items: [messagesItem(10)] },
					{ plan_id: takenId, name: "Taken" },
				],
			});
			await expectAutumnError({
				errCode: ErrCode.ProductIdAlreadyExists,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: baseId,
								variants: [{ variant_plan_id: takenId, name: "Team EU" }],
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, takenId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants create: missing name on new id → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_name_b");
		const variantId = uniqueTestId("cv2_var_name_v");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: baseId, name: "Team", items: [messagesItem(10)] }],
			});
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: baseId,
								variants: [{ variant_plan_id: variantId }],
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants create: variant_plan_id === plan_id → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_self_b");
		await deleteDbPlans({ ctx, planIds: [baseId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: baseId, name: "Team", items: [messagesItem(10)] }],
			});
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: baseId,
								variants: [{ variant_plan_id: baseId, name: "Self" }],
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants create: duplicate variant_plan_id → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_dup_b");
		const variantId = uniqueTestId("cv2_var_dup_v");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: baseId, name: "Team", items: [messagesItem(10)] }],
			});
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: baseId,
								variants: [
									{ variant_plan_id: variantId, name: "EU" },
									{ variant_plan_id: variantId, name: "EU 2" },
								],
							},
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants: top-level and variants[] together → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_both_b");
		const variantId = uniqueTestId("cv2_var_both_v");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseAndVariant({ autumnV2_3, baseId, variantId });
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [
							{
								plan_id: baseId,
								variants: [{ variant_plan_id: variantId }],
							},
							{ plan_id: variantId },
						],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 variants create: is_default on variant → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_var_def_b");
		const variantId = uniqueTestId("cv2_var_def_v");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseAndVariant({ autumnV2_3, baseId, variantId });
			await expectAutumnError({
				errCode: ErrCode.VariantCannotBeDefault,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [{ plan_id: variantId, is_default: true }],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);
