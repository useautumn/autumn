/**
 * catalogV2.update — cannot remove a base that would leave variants
 * without a live unarchived base. Same-call remove of the variant is ok.
 *
 * Contract:
 *   Unpinned delete of Team while EU survives → 400
 *   Unpinned archive of Team while EU survives → 400
 *   Same-call remove Team + EU, no customers → both hard-delete
 */

import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import { test } from "bun:test";
import chalk from "chalk";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { cleanupPlanCustomerRefs } from "../utils/cleanupPlanCustomerRefs.js";
import {
	deleteDbPlans,
	expectCatalogPlansCorrect,
	expectDbPlansAbsent,
} from "../utils/expectCatalogPlans.js";
import { seedVersionableCustomer } from "../migrations/utils/seedVersionableCustomer.js";
import { seedBaseWithVariant } from "../variants/utils/seedVariantPlans.js";

const cannotRemoveWithVariants = ({ planId }: { planId: string }) =>
	`Cannot delete or archive plan ${planId} while it still has variants`;

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans: unpinned delete of a base with variants is 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_rmp_var_del");
		const variantId = uniqueTestId("cv2_rmp_var_del_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});

			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				errMessage: cannotRemoveWithVariants({ planId: baseId }),
				func: () =>
					autumnV2_3.catalogV2.update({
						remove_plans: [{ plan_id: baseId }],
					}),
			});

			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [{ id: baseId, name: "Team" }],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans: unpinned archive of a base with variants is 400")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_rmp_var_arch");
		const variantId = uniqueTestId("cv2_rmp_var_arch_eu");
		await cleanupPlanCustomerRefs({ ctx, planIds: [baseId, variantId] });
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			await seedVersionableCustomer({ ctx, planId: baseId });

			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				errMessage: cannotRemoveWithVariants({ planId: baseId }),
				func: () =>
					autumnV2_3.catalogV2.update({
						remove_plans: [{ plan_id: baseId }],
					}),
			});

			await expectCatalogPlansCorrect({
				autumn: autumnV2_3,
				expected: [{ id: baseId, name: "Team", archived: false }],
			});
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [baseId, variantId] });
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 remove plans: same-call remove of base and variant hard-deletes both")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const baseId = uniqueTestId("cv2_rmp_var_both");
		const variantId = uniqueTestId("cv2_rmp_var_both_eu");
		await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		try {
			await seedBaseWithVariant({
				autumn: autumnV2_3,
				baseId,
				variantId,
			});
			await autumnV2_3.catalogV2.update({
				remove_plans: [{ plan_id: baseId }, { plan_id: variantId }],
			});
			await expectDbPlansAbsent({ ctx, planIds: [baseId, variantId] });
		} finally {
			await deleteDbPlans({ ctx, planIds: [baseId, variantId] });
		}
	},
);
