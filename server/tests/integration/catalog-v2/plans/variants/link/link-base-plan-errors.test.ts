/**
 * catalogV2.update — `base_plan_id` guards.
 *
 * Contract:
 *   base_plan_id === plan_id → 400
 *   unknown base → product_not_found
 *   base is itself a variant → nested_variant_not_allowed
 *   plan already has variants → nested_variant_not_allowed
 *   default plan linked to a base → variant_cannot_be_default
 */

import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../../utils/uniqueTestId.js";
import { messagesItem } from "../../licenses/utils/seedLicensePlans.js";
import { deleteDbPlans } from "../../utils/expectCatalogPlans.js";
import { seedBaseWithVariant } from "../utils/seedVariantPlans.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 base_plan_id: self link → 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_link_self");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Solo", items: [messagesItem(10)] }],
			});
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [{ plan_id: planId, base_plan_id: planId }],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 base_plan_id: unknown base → product_not_found")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_link_missing");
		const ghostId = uniqueTestId("cv2_link_ghost");
		await deleteDbPlans({ ctx, planIds: [planId, ghostId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Solo", items: [messagesItem(10)] }],
			});
			await expectAutumnError({
				errCode: ErrCode.ProductNotFound,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [{ plan_id: planId, base_plan_id: ghostId }],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId, ghostId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 base_plan_id: base is a variant → nested_variant_not_allowed")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_link_nest_b");
		const variantId = uniqueTestId("cv2_link_nest_v");
		const otherId = uniqueTestId("cv2_link_nest_o");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId, otherId] });
		try {
			await seedBaseWithVariant({ autumn: autumnV2_3, baseId, variantId });
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: otherId, name: "Other", items: [messagesItem(10)] }],
			});
			await expectAutumnError({
				errCode: ErrCode.NestedVariantNotAllowed,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [{ plan_id: otherId, base_plan_id: variantId }],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId, otherId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 base_plan_id: plan with variants → nested_variant_not_allowed")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_link_hasvar_b");
		const variantId = uniqueTestId("cv2_link_hasvar_v");
		const otherId = uniqueTestId("cv2_link_hasvar_o");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId, otherId] });
		try {
			await seedBaseWithVariant({ autumn: autumnV2_3, baseId, variantId });
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: otherId, name: "Other", items: [messagesItem(10)] }],
			});
			await expectAutumnError({
				errCode: ErrCode.NestedVariantNotAllowed,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [{ plan_id: baseId, base_plan_id: otherId }],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId, otherId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 base_plan_id: linking the default plan → variant_cannot_be_default")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_link_def_b");
		const defaultId = uniqueTestId("cv2_link_def_d");
		await deleteDbPlans({ ctx, planIds: [baseId, defaultId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: baseId, name: "Team", items: [messagesItem(10)] },
					{ plan_id: defaultId, name: "Free", is_default: true },
				],
			});
			await expectAutumnError({
				errCode: ErrCode.VariantCannotBeDefault,
				func: () =>
					autumnV2_3.catalogV2.update({
						plans: [{ plan_id: defaultId, base_plan_id: baseId }],
					}),
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, defaultId] });
		}
	},
);
