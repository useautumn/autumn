/**
 * catalogV2.update — versioning: "all_versions" item patches.
 *
 * Item changes propagate to every historical version in place. No new version
 * is minted. A customer parked on v1 does not block the in-place patch of v2.
 */

import { test } from "bun:test";
import {
	CusProductStatus,
	customerProducts,
	customers,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { generateId } from "@/utils/genUtils.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import {
	deleteDbPlans,
	expectDbPlansCorrect,
	expectPlanVersionsCorrect,
} from "../utils/expectCatalogPlans.js";
import {
	expectPlanRowsCorrect,
	snapshotPlanRows,
} from "../utils/expectPlanRows.js";

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

const seedCustomerOnVersion = async ({
	ctx,
	planId,
	version,
}: {
	ctx: AutumnContext;
	planId: string;
	version: number;
}) => {
	const full = await getFull({ ctx, planId, version });
	const customerId = uniqueTestId("cv2_all_cus");
	const internalCustomerId = generateId("cus");
	const cusProductId = generateId("cus_prod");

	await ctx.db.insert(customers).values({
		internal_id: internalCustomerId,
		id: customerId,
		org_id: ctx.org.id,
		env: ctx.env,
		created_at: Date.now(),
		name: customerId,
		email: `${customerId}@test.com`,
	});

	await ctx.db.insert(customerProducts).values({
		id: cusProductId,
		internal_customer_id: internalCustomerId,
		product_id: planId,
		internal_product_id: full.internal_id,
		status: CusProductStatus.Active,
		created_at: Date.now(),
		starts_at: Date.now(),
		quantity: 1,
		options: [],
		is_custom: false,
	});

	return { customerId, internalCustomerId, cusProductId };
};

const cleanupCustomerRefs = async ({
	ctx,
	planIds,
}: {
	ctx: AutumnContext;
	planIds: string[];
}) => {
	for (const planId of planIds) {
		const cusProds = await ctx.db
			.select()
			.from(customerProducts)
			.where(eq(customerProducts.product_id, planId));
		for (const row of cusProds) {
			await ctx.db
				.delete(customerProducts)
				.where(eq(customerProducts.id, row.id));
			await ctx.db
				.delete(customers)
				.where(eq(customers.internal_id, row.internal_customer_id));
		}
	}
};

const messagesItem = (included: number) => ({
	feature_id: TestFeature.Messages,
	included,
	reset: { interval: ResetInterval.Month },
});

const seedV1AndMintV2 = async ({
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
				name: "V1",
				items: [messagesItem(100)],
			},
		],
	});
	await autumn.catalogV2.update({
		plans: [
			{
				plan_id: planId,
				name: "V2",
				items: [messagesItem(150)],
				versioning: "new_version",
			},
		],
	});
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 all_versions: items change patches every version in place")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_all_items");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndMintV2({ autumn: autumnV2_3, planId });
			const v1Before = await snapshotPlanRows({ ctx, planId, version: 1 });
			const v2Before = await snapshotPlanRows({ ctx, planId, version: 2 });

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						versioning: "all_versions",
						items: [messagesItem(250)],
					},
				],
			});

			await expectPlanVersionsCorrect({
				ctx,
				planId,
				versions: [1, 2],
			});
			await expectDbPlansCorrect({
				ctx,
				expected: [
					{
						id: planId,
						version: 1,
						name: "V1",
						allowances: { [TestFeature.Messages]: 250 },
					},
					{
						id: planId,
						version: 2,
						name: "V2",
						allowances: { [TestFeature.Messages]: 250 },
					},
				],
			});
			await expectPlanRowsCorrect({
				ctx,
				before: v1Before,
				expected: {
					mintedEnts: [{ featureId: TestFeature.Messages, allowance: 250 }],
				},
			});
			await expectPlanRowsCorrect({
				ctx,
				before: v2Before,
				expected: {
					mintedEnts: [{ featureId: TestFeature.Messages, allowance: 250 }],
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 all_versions: name patch does not mint a new version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_all_nomint");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndMintV2({ autumn: autumnV2_3, planId });

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						versioning: "all_versions",
						name: "Propagated",
					},
				],
			});

			await expectPlanVersionsCorrect({
				ctx,
				planId,
				versions: [1, 2],
			});
			await expectDbPlansCorrect({
				ctx,
				expected: [
					{ id: planId, version: 1, name: "Propagated" },
					{ id: planId, version: 2, name: "Propagated" },
				],
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 all_versions: customer on v1 still patches both versions in place")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_all_cus_v1");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await seedV1AndMintV2({ autumn: autumnV2_3, planId });
			await seedCustomerOnVersion({ ctx, planId, version: 1 });

			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						versioning: "all_versions",
						items: [messagesItem(300)],
					},
				],
			});

			await expectPlanVersionsCorrect({
				ctx,
				planId,
				versions: [1, 2],
			});
			await expectDbPlansCorrect({
				ctx,
				expected: [
					{
						id: planId,
						version: 1,
						allowances: { [TestFeature.Messages]: 300 },
					},
					{
						id: planId,
						version: 2,
						allowances: { [TestFeature.Messages]: 300 },
					},
				],
			});
		} finally {
			await cleanupCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
