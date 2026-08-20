/**
 * Default plans × versioning — creating a customer must attach exactly ONE
 * version of a default plan: the latest. Covers the normal mint flow (flag
 * moves to v2) and the bad state where both versions are flagged is_default.
 */

import { expect, test } from "bun:test";
import { customerProducts, products, ResetInterval } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { cleanupPlanCustomerRefs } from "../utils/cleanupPlanCustomerRefs.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";

const getFull = async ({
	ctx,
	planId,
	version,
}: {
	ctx: AutumnContext;
	planId: string;
	version?: number;
}) =>
	ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
		version,
	});

const seedDefaultFreeV1 = async ({
	autumn,
	planId,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	planId: string;
}) => {
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				name: "Free Default V1",
				auto_enable: true,
				group: `g_${planId}`,
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 100,
						reset: { interval: ResetInterval.Month },
					},
				],
			},
		],
	});
};

const mintV2 = async ({
	autumn,
	planId,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	planId: string;
}) => {
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				versioning: "new_version",
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 200,
						reset: { interval: ResetInterval.Month },
					},
				],
			},
		],
	});
};

/** cusProduct rows for one customer on one plan, any version. */
const fetchAttachedPlanRows = async ({
	ctx,
	internalCustomerId,
	planId,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
	planId: string;
}) =>
	ctx.db
		.select()
		.from(customerProducts)
		.where(
			and(
				eq(customerProducts.internal_customer_id, internalCustomerId),
				eq(customerProducts.product_id, planId),
			),
		);

test.concurrent(
	`${chalk.yellowBright("catalogV2 defaults: customer after mint gets v2 only; earlier customer stays on v1")}`,
	async () => {
		const { autumnV1, autumnV2_3, ctx } = await initScenario({
			setup: [],
			actions: [],
		});
		const planId = uniqueTestId("cv2_def_mint");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedDefaultFreeV1({ autumn: autumnV2_3, planId });

			const beforeMint = await autumnV1.customers.create({
				id: uniqueTestId("cv2_defcus_v1"),
				email: `${planId}-v1@test.com`,
				withAutumnId: true,
				internalOptions: { default_group: `g_${planId}` },
			});

			await mintV2({ autumn: autumnV2_3, planId });

			const afterMint = await autumnV1.customers.create({
				id: uniqueTestId("cv2_defcus_v2"),
				email: `${planId}-v2@test.com`,
				withAutumnId: true,
				internalOptions: { default_group: `g_${planId}` },
			});

			const v1 = await getFull({ ctx, planId, version: 1 });
			const v2 = await getFull({ ctx, planId, version: 2 });

			const beforeRows = await fetchAttachedPlanRows({
				ctx,
				internalCustomerId: beforeMint.autumn_id as string,
				planId,
			});
			expect(beforeRows).toHaveLength(1);
			expect(beforeRows[0]?.internal_product_id).toBe(v1.internal_id);

			const afterRows = await fetchAttachedPlanRows({
				ctx,
				internalCustomerId: afterMint.autumn_id as string,
				planId,
			});
			expect(afterRows).toHaveLength(1);
			expect(afterRows[0]?.internal_product_id).toBe(v2.internal_id);
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 defaults: bad state — v1 AND v2 both is_default → only latest attached")}`,
	async () => {
		const { autumnV1, autumnV2_3, ctx } = await initScenario({
			setup: [],
			actions: [],
		});
		const planId = uniqueTestId("cv2_def_dual");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedDefaultFreeV1({ autumn: autumnV2_3, planId });
			await mintV2({ autumn: autumnV2_3, planId });

			// Force the bad state: mint moved the flag to v2, re-flag v1 too.
			const v1 = await getFull({ ctx, planId, version: 1 });
			const v2 = await getFull({ ctx, planId, version: 2 });
			await ctx.db
				.update(products)
				.set({ is_default: true })
				.where(eq(products.internal_id, v1.internal_id));

			const customer = await autumnV1.customers.create({
				id: uniqueTestId("cv2_defcus_dual"),
				email: `${planId}-dual@test.com`,
				withAutumnId: true,
				internalOptions: { default_group: `g_${planId}` },
			});

			const attachedRows = await fetchAttachedPlanRows({
				ctx,
				internalCustomerId: customer.autumn_id as string,
				planId,
			});
			expect(
				attachedRows,
				"exactly one version of the default plan may attach",
			).toHaveLength(1);
			expect(attachedRows[0]?.internal_product_id).toBe(v2.internal_id);
		} finally {
			await cleanupPlanCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
