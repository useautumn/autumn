/**
 * catalogV2.update — plan-id aliases. Rename writes one alias row (old → new);
 * ingress rewrites the old id to the live id; responses stay canonical.
 *
 * Contract:
 *   Rename writes product_aliases (alias_id=old, canonical_plan_id=new)
 *   Re-rename replaces the row; the original alias no longer resolves
 *   Attach / GET with the old id succeeds; response id is canonical (no alias_id)
 *   REST POST /products reserved id → 400
 *   Catalog new_plan_id onto another plan's alias → succeeds; alias deleted
 *   Preview of that claim stamps alias_replacement
 *
 * Endpoint × field coverage: `../aliases/*.test.ts` and CASES.md §4.
 */

import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	type AttachParamsV1Input,
	ErrCode,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";
import {
	expectPlanPreviewRowCorrect,
	parsePlanPreview,
} from "../preview/utils/expectPlanPreview.js";
import {
	deleteAliases,
	listAliases,
} from "../utils/planAliasTestUtils.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan aliases: rename writes alias; re-rename replaces; old alias dies")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_alias");
		const newPlanId = uniqueTestId("cv2_alias_new");
		const newerPlanId = uniqueTestId("cv2_alias_newer");
		const planIds = [planId, newPlanId, newerPlanId];
		await deleteDbPlans({ ctx, planIds });
		await deleteAliases({ ctx, planIds });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Alias Source" }],
			});
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, new_plan_id: newPlanId }],
			});

			const afterRename = await listAliases({ ctx, planIds });
			expect(afterRename).toHaveLength(1);
			expect(afterRename[0]?.alias_id).toBe(planId);
			expect(afterRename[0]?.canonical_plan_id).toBe(newPlanId);

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: newPlanId, new_plan_id: newerPlanId }],
			});

			const afterReRename = await listAliases({ ctx, planIds });
			expect(afterReRename).toHaveLength(1);
			expect(afterReRename[0]?.alias_id).toBe(newPlanId);
			expect(afterReRename[0]?.canonical_plan_id).toBe(newerPlanId);

			await expectAutumnError({
				func: () => autumnV2_3.products.get(planId),
			});
		} finally {
			await deleteAliases({ ctx, planIds });
			await deleteDbPlans({ ctx, planIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan aliases: attach and GET with old id resolve to canonical id")}`,
	async () => {
		const { autumnV2_3, ctx, customerId } = await initScenario({
			customerId: uniqueTestId("cv2_alias_cus"),
			setup: [s.customer()],
			actions: [],
		});
		const planId = uniqueTestId("cv2_alias_get");
		const newPlanId = uniqueTestId("cv2_alias_get_new");
		const planIds = [planId, newPlanId];
		await deleteDbPlans({ ctx, planIds });
		await deleteAliases({ ctx, planIds });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Alias Attach" }],
			});
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, new_plan_id: newPlanId }],
			});

			await autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: planId,
			});

			const plan = await autumnV2_3.products.get<ApiPlanV1>(planId);
			expect(plan.id).toBe(newPlanId);
			expect(plan).not.toHaveProperty("alias_id");

			await expectCustomerProducts({
				customerId,
				autumn: autumnV2_3,
				active: [newPlanId],
			});
		} finally {
			await autumnV2_3.customers.delete(customerId).catch(() => {});
			await deleteAliases({ ctx, planIds });
			await deleteDbPlans({ ctx, planIds });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan aliases: REST create reserved id 400; catalog rename claims alias")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_alias_err");
		const newPlanId = uniqueTestId("cv2_alias_err_new");
		const otherPlanId = uniqueTestId("cv2_alias_err_other");
		const planIds = [planId, newPlanId, otherPlanId];
		await deleteDbPlans({ ctx, planIds });
		await deleteAliases({ ctx, planIds });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: planId, name: "Alias Occupied" },
					{ plan_id: otherPlanId, name: "Other" },
				],
			});
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, new_plan_id: newPlanId }],
			});

			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				errMessage: "reserved as an alias",
				func: () =>
					autumnV2_3.products.create({
						id: planId,
						name: "Should Not Create",
					}),
			});

			const collidePreview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: otherPlanId, new_plan_id: planId }],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview: collidePreview,
				expected: {
					planId: otherPlanId,
					action: "update",
					aliasReplacement: { alias_id: planId, plan_id: newPlanId },
				},
			});

			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: otherPlanId, new_plan_id: planId }],
			});
			const afterClaim = await listAliases({ ctx, planIds });
			expect(afterClaim.some((row) => row.alias_id === planId)).toBe(false);
			const claimed = await autumnV2_3.products.get<ApiPlanV1>(planId);
			expect(claimed.id).toBe(planId);
			expect(claimed.name).toBe("Other");
		} finally {
			await deleteAliases({ ctx, planIds });
			await deleteDbPlans({ ctx, planIds });
		}
	},
);
