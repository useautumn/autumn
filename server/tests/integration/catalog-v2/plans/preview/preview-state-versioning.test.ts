/**
 * catalogV2.preview_update — state.has_customers + versioning block.
 *
 * has_customers is already populated from upsert.state (green-expected).
 * versioning is stubbed null → RED for versioning cases.
 */

import { expect, test } from "bun:test";
import {
	CusProductStatus,
	customerProducts,
	customers,
	PreviewUpdateCatalogResponseSchema,
} from "@autumn/shared";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { generateId } from "@/utils/genUtils.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";
import {
	expectPlanPreviewRowCorrect,
	findPlanPreviewRow,
	parsePlanPreview,
} from "./utils/expectPlanPreview.js";

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

const seedCustomerProductRef = async ({
	ctx,
	planId,
	status = CusProductStatus.Active,
	version,
}: {
	ctx: AutumnContext;
	planId: string;
	status?: CusProductStatus;
	version?: number;
}) => {
	const full = await getFull({ ctx, planId, version });
	const customerId = uniqueTestId("cv2_pv_cus");
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
		status,
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

const unimplementedNewVersionReason =
	'versioning "new_version" is not implemented yet';

test.concurrent(
	`${chalk.yellowBright("catalogV2 preview-state: has_customers true with attached customer; false without")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const withCus = uniqueTestId("cv2_pv_hc");
		const withoutCus = uniqueTestId("cv2_pv_nc");
		await deleteDbPlans({ ctx, planIds: [withCus, withoutCus] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{ plan_id: withCus, name: "With Cus" },
					{ plan_id: withoutCus, name: "No Cus" },
				],
			});
			await seedCustomerProductRef({ ctx, planId: withCus });

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{ plan_id: withCus, name: "With Cus Renamed" },
						{ plan_id: withoutCus, name: "No Cus Renamed" },
					],
				}),
			);
			PreviewUpdateCatalogResponseSchema.parse(preview);
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId: withCus,
					action: "update",
					hasCustomers: true,
				},
			});
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId: withoutCus,
					action: "update",
					hasCustomers: false,
				},
			});
		} finally {
			await cleanupCustomerRefs({ ctx, planIds: [withCus, withoutCus] });
			await deleteDbPlans({ ctx, planIds: [withCus, withoutCus] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 preview-state: expired-only customers → has_customers false")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_pv_exp");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Expired Only" }],
			});
			await seedCustomerProductRef({
				ctx,
				planId,
				status: CusProductStatus.Expired,
			});

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: planId, name: "Expired Renamed" }],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId,
					action: "update",
					hasCustomers: false,
				},
			});
		} finally {
			await cleanupCustomerRefs({ ctx, planIds: [planId] });
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED: versioning stubbed null
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 preview-versioning: latest of 2-version → existing resolved")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_pv_ver");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "V1" }],
			});
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, version: 2, name: "V2" }],
			});

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: planId, name: "V2 Renamed" }],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId,
					action: "update",
					versioning: {
						current_version: 2,
						new_version: null,
						resolved: "existing",
						options: [
							{ strategy: "existing", available: true },
							{
								strategy: "new_version",
								available: false,
								reason: unimplementedNewVersionReason,
							},
							{ strategy: "all_versions", available: true },
						],
					},
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED — options list; new_version unavailable
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 preview-versioning: options list; new_version unavailable")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_pv_opts");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "Opts" }],
			});
			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [{ plan_id: planId, name: "Opts2" }],
				}),
			);
			expectPlanPreviewRowCorrect({
				preview,
				expected: {
					planId,
					versioning: {
						current_version: 1,
						new_version: null,
						resolved: "existing",
						options: [
							{ strategy: "existing", available: true },
							{
								strategy: "new_version",
								available: false,
								reason: unimplementedNewVersionReason,
							},
							{ strategy: "all_versions", available: true },
						],
					},
				},
			});
			const strategies = (
				findPlanPreviewRow({ preview, planId }).versioning?.options ?? []
			).map((o) => o.strategy);
			expect(strategies.sort()).toEqual([
				"all_versions",
				"existing",
				"new_version",
			]);
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

// RED — all_versions → one preview row per affected version
test.concurrent(
	`${chalk.yellowBright("RED: catalogV2 preview-versioning: all_versions → one row per version")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_pv_all");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, name: "V1" }],
			});
			await autumnV2_3.catalogV2.update({
				plans: [{ plan_id: planId, version: 2, name: "V2" }],
			});

			const preview = parsePlanPreview(
				await autumnV2_3.catalogV2.previewUpdate({
					plans: [
						{
							plan_id: planId,
							versioning: "all_versions",
							name: "Propagated",
						},
					],
				}),
			);
			PreviewUpdateCatalogResponseSchema.parse(preview);

			const rows = preview.plans.filter((p) => p.plan_id === planId);
			expect(rows.length).toBeGreaterThanOrEqual(2);
			const versions = rows.map((r) => r.versioning?.current_version).sort();
			expect(versions).toEqual([1, 2]);
			for (const row of rows) {
				expect(row.versioning?.resolved).toBe("all_versions");
				expect(row.versioning?.new_version).toBeNull();
				expect(row.versioning?.options).toEqual([
					{ strategy: "existing", available: true },
					{
						strategy: "new_version",
						available: false,
						reason: unimplementedNewVersionReason,
					},
					{ strategy: "all_versions", available: true },
				]);
			}
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
