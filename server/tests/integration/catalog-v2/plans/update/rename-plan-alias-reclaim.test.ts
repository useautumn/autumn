/**
 * catalogV2.update — own-alias reclaim roundtrip.
 *
 * After pro → proNew, pro aliases proNew. Renaming back (proNew → pro)
 * reclaims the original id: proNew becomes the alias, the old alias dies.
 */

import { expect, test } from "bun:test";
import {
	type ApiPlanV1,
	type AttachParamsV1Input,
	customerProducts,
	ErrCode,
} from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";
import {
	deleteAliases,
	listAliases,
	renamePlan,
} from "../utils/planAliasTestUtils.js";
import { cleanupRefs, seedCustomerProductRef } from "../utils/seedPlanRefs.js";

test.concurrent(
	`${chalk.yellowBright("catalogV2 plan aliases: rename then reclaim original id (own-alias roundtrip)")}`,
	async () => {
		const pro = products.pro({ items: [] });
		const customerId = uniqueTestId("cv2_reclaim");
		const otherId = uniqueTestId("cv2_reclaim_b");
		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.otherCustomers([{ id: otherId, paymentMethod: "success" }]),
			],
			actions: [],
		});
		const originalId = pro.id;
		const newPlanId = uniqueTestId("cv2_reclaim_new");
		const planIds = [originalId, newPlanId];
		await deleteAliases({ ctx, planIds });
		await deleteDbPlans({ ctx, planIds: [newPlanId] });
		let cusProductId: string | undefined;
		try {
			({ cusProductId } = await seedCustomerProductRef({
				ctx,
				planId: originalId,
			}));

			await renamePlan({
				autumn: autumnV2_3,
				fromId: originalId,
				toId: newPlanId,
			});

			const afterFirstRename = await listAliases({ ctx, planIds });
			expect(afterFirstRename).toHaveLength(1);
			expect(afterFirstRename[0]?.alias_id).toBe(originalId);
			expect(afterFirstRename[0]?.canonical_plan_id).toBe(newPlanId);

			const liveAfterFirst =
				await autumnV2_3.products.get<ApiPlanV1>(originalId);
			expect(liveAfterFirst.id).toBe(newPlanId);
			expect(liveAfterFirst).not.toHaveProperty("alias_id");

			const [cusProductAfterFirst] = await ctx.db
				.select()
				.from(customerProducts)
				.where(eq(customerProducts.id, cusProductId));
			expect(cusProductAfterFirst.product_id).toBe(originalId);

			await autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: originalId,
			});
			await expectCustomerProducts({
				customerId,
				autumn: autumnV2_3,
				active: [newPlanId],
			});

			await renamePlan({
				autumn: autumnV2_3,
				fromId: newPlanId,
				toId: originalId,
			});

			const afterReclaim = await listAliases({ ctx, planIds });
			expect(afterReclaim).toHaveLength(1);
			expect(afterReclaim[0]?.alias_id).toBe(newPlanId);
			expect(afterReclaim[0]?.canonical_plan_id).toBe(originalId);

			const liveByOriginal =
				await autumnV2_3.products.get<ApiPlanV1>(originalId);
			const liveByPrevious =
				await autumnV2_3.products.get<ApiPlanV1>(newPlanId);
			expect(liveByOriginal.id).toBe(originalId);
			expect(liveByPrevious.id).toBe(originalId);
			expect(liveByOriginal).not.toHaveProperty("alias_id");
			expect(liveByPrevious).not.toHaveProperty("alias_id");

			await autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: otherId,
				plan_id: newPlanId,
			});
			await expectCustomerProducts({
				customerId: otherId,
				autumn: autumnV2_3,
				active: [originalId],
			});

			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				errMessage: "reserved as an alias",
				func: () =>
					autumnV2_3.products.create({
						id: newPlanId,
						name: "Should Not Create",
					}),
			});
		} finally {
			await autumnV2_3.customers.delete(customerId).catch(() => {});
			await autumnV2_3.customers.delete(otherId).catch(() => {});
			await cleanupRefs({ ctx, planIds });
			await deleteAliases({ ctx, planIds });
			await deleteDbPlans({ ctx, planIds });
		}
	},
);
