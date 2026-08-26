/**
 * Ingress plan-id aliases on CORE catalog read/write endpoints.
 *
 * Path `:product_id` and body `plan_id` rewrite to the canonical id.
 * `new_plan_id` and create-plan identity fields are not rewritten.
 */

import { expect, test } from "bun:test";
import { type ApiPlanV1 } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { expectLicenseLinkCorrect } from "../licenses/utils/expectLicenseLinkCorrect.js";
import {
	parsePlanPreview,
	expectPlanPreviewRowCorrect,
} from "../preview/utils/expectPlanPreview.js";
import {
	deleteDbPlans,
	expectCatalogPlansCorrect,
} from "../utils/expectCatalogPlans.js";
import {
	deleteAliases,
	listAliases,
	renamePlan,
} from "../utils/planAliasTestUtils.js";

test.concurrent(
	`${chalk.yellowBright("plan aliases catalog: GET path / plans.get / has_customers")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const oldId = uniqueTestId("alias_get");
		const newId = uniqueTestId("alias_get_n");
		const planIds = [oldId, newId];

		await deleteDbPlans({ ctx, planIds });
		await deleteAliases({ ctx, planIds });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: oldId, name: "Alias Get" }],
			});
			await renamePlan({ autumn: autumnV2_3, fromId: oldId, toId: newId });

			const viaPath = await autumnV2_3.products.get<ApiPlanV1>(oldId);
			expect(viaPath.id).toBe(newId);

			const viaRpc = (await autumnV2_3.post("/plans.get", {
				plan_id: oldId,
			})) as ApiPlanV1;
			expect(viaRpc.id).toBe(newId);

			const hasCustomers = (await autumnV2_3.post("/plans.has_customers", {
				plan_id: oldId,
			})) as { current_version: number };
			expect(hasCustomers.current_version).toBe(1);

			const hasCustomersPath = (await autumnV2_3.post(
				`/products/${oldId}/has_customers`,
				{},
			)) as { current_version: number };
			expect(hasCustomersPath.current_version).toBe(1);
		} finally {
			await deleteAliases({ ctx, planIds });
			await deleteDbPlans({ ctx, planIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("plan aliases catalog: catalogV2.update / preview / PATCH path / licenses[]")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const oldId = uniqueTestId("alias_upd");
		const newId = uniqueTestId("alias_upd_n");
		const childOld = uniqueTestId("alias_lic");
		const childNew = uniqueTestId("alias_lic_n");
		const planIds = [oldId, newId, childOld, childNew];

		await deleteDbPlans({ ctx, planIds });
		await deleteAliases({ ctx, planIds });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: oldId, name: "Parent" },
					{ plan_id: childOld, name: "Seat" },
				],
			});
			await renamePlan({ autumn: autumnV2_3, fromId: oldId, toId: newId });
			await renamePlan({ autumn: autumnV2_3, fromId: childOld, toId: childNew });

			const preview = await autumnV2_3.catalogV2.previewUpdate({
				plans: [{ plan_id: oldId, name: "Parent Renamed" }],
			});
			const previewIds = JSON.stringify(preview);
			expect(previewIds).toContain(newId);

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: oldId, name: "Parent Renamed" }],
			});
			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [{ id: newId, name: "Parent Renamed" }],
			});

			await autumnV2_3.products.update(oldId, { name: "Parent Patched" });
			const patched = await autumnV2_3.products.get<ApiPlanV1>(newId);
			expect(patched.name).toBe("Parent Patched");

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: newId,
						licenses: [{ license_plan_id: childOld, included: 2 }],
					},
				],
			});
			await expectLicenseLinkCorrect({
				ctx,
				parentPlanId: newId,
				licensePlanId: childNew,
				included: 2,
			});
		} finally {
			await deleteAliases({ ctx, planIds });
			await deleteDbPlans({ ctx, planIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("plan aliases catalog: delete path / remove_plans / create_variant / new_plan_id skip")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const deleteOld = uniqueTestId("alias_del");
		const deleteNew = uniqueTestId("alias_del_n");
		const removeOld = uniqueTestId("alias_rm");
		const removeNew = uniqueTestId("alias_rm_n");
		const rpcOld = uniqueTestId("alias_rpc");
		const rpcNew = uniqueTestId("alias_rpc_n");
		const baseOld = uniqueTestId("alias_var");
		const baseNew = uniqueTestId("alias_var_n");
		const variantId = uniqueTestId("alias_var_eu");
		const planIds = [
			deleteOld,
			deleteNew,
			removeOld,
			removeNew,
			rpcOld,
			rpcNew,
			baseOld,
			baseNew,
			variantId,
		];

		await deleteDbPlans({ ctx, planIds });
		await deleteAliases({ ctx, planIds });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: deleteOld, name: "Delete Me" },
					{ plan_id: removeOld, name: "Remove Me" },
					{ plan_id: rpcOld, name: "Rpc Delete" },
					{ plan_id: baseOld, name: "Base" },
				],
			});
			await renamePlan({
				autumn: autumnV2_3,
				fromId: deleteOld,
				toId: deleteNew,
			});
			await renamePlan({
				autumn: autumnV2_3,
				fromId: removeOld,
				toId: removeNew,
			});
			await renamePlan({ autumn: autumnV2_3, fromId: rpcOld, toId: rpcNew });
			await renamePlan({ autumn: autumnV2_3, fromId: baseOld, toId: baseNew });

			await autumnV2_3.products.delete(deleteOld);
			await expectAutumnError({
				func: () => autumnV2_3.products.get(deleteNew),
			});

			await autumnV2_3.catalogV2.update({
				remove_plans: [{ plan_id: removeOld }],
			});
			await expectAutumnError({
				func: () => autumnV2_3.products.get(removeNew),
			});

			await autumnV2_3.post("/plans.delete", { plan_id: rpcOld });
			await expectAutumnError({
				func: () => autumnV2_3.products.get(rpcNew),
			});

			await autumnV2_3.plans.createVariant({
				base_plan_id: baseOld,
				variant_plan_id: variantId,
				name: "EU",
			});
			const variant = await autumnV2_3.products.get<ApiPlanV1>(variantId);
			expect(variant.id).toBe(variantId);

			const claimPreview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: variantId, new_plan_id: baseOld }],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview: claimPreview,
				expected: {
					planId: variantId,
					action: "update",
					aliasReplacement: { alias_id: baseOld, plan_id: baseNew },
				},
			});

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: variantId, new_plan_id: baseOld }],
			});
			const afterClaim = await listAliases({ ctx, planIds });
			expect(afterClaim.some((row) => row.alias_id === baseOld)).toBe(false);
			const claimed = await autumnV2_3.products.get<ApiPlanV1>(baseOld);
			expect(claimed.id).toBe(baseOld);
			expect(claimed.name).toBe("EU");
		} finally {
			await deleteAliases({ ctx, planIds });
			await deleteDbPlans({ ctx, planIds });
		}
	},
);
