/**
 * Custom plans export
 *
 * Contract under test (custom_plans producer):
 *   - A plan that matches its catalog version but is flagged custom yields a
 *     matches_catalog row with no diff.
 *   - A plan customized at attach yields a customized row, with the
 *     diff of what differs from the catalog.
 *   - A custom_plans job runs to completion: published to S3, downloadable
 *     under its own file name, one row per customer product in scope.
 */

import { expect, test } from "bun:test";
import {
	type AttachParamsV1Input,
	CustomerExportKind,
	CustomerExportStatus,
	customerExports,
	customerProducts,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { isCustomerExportsS3Configured } from "@/external/aws/s3/customerExportsS3Config";
import { CusService } from "@/internal/customers/CusService";
import { downloadCustomerExport } from "@/internal/customers/exports/actions/downloadCustomerExport";
import { CustomerExportService } from "@/internal/customers/exports/CustomerExportService";
import { customerToCustomPlansExportRows } from "@/internal/customers/exports/customPlans/customerToCustomPlansExportRows";
import { executeCustomerExport } from "@/internal/customers/exports/workflows/executeCustomerExport";

const setupCustomer = async ({
	customerId,
	customize,
}: {
	customerId: string;
	customize?: AttachParamsV1Input["customize"];
}) => {
	const base = products.base({
		id: "base",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { ctx, autumnV2 } = await initScenario({
		customerId,
		setup: [s.customer({}), s.products({ list: [base] })],
		actions: [],
	});
	await autumnV2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: base.id,
		...(customize ? { customize } : {}),
	});

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const customerProduct = fullCustomer.customer_products.find(
		(cusProduct) => cusProduct.product.id === base.id,
	);
	if (!customerProduct) throw new Error("Attach left no customer product");

	const scalar = {
		internal_id: fullCustomer.internal_id,
		id: fullCustomer.id ?? null,
		name: fullCustomer.name ?? null,
		email: fullCustomer.email ?? null,
		processor: fullCustomer.processor ?? null,
	};
	return { ctx, base, scalar, customerProduct };
};

test.concurrent(
	`${chalk.yellowBright("custom-plans export 1: catalog plan flagged custom -> matches_catalog row")}`,
	async () => {
		const { ctx, scalar, customerProduct } = await setupCustomer({
			customerId: "custom-plans-export-wrong-flag",
		});
		expect(customerProduct.is_custom).toBe(false);

		await ctx.db
			.update(customerProducts)
			.set({ is_custom: true })
			.where(eq(customerProducts.id, customerProduct.id));

		const rows = await customerToCustomPlansExportRows({
			ctx,
			scalar,
			filters: {},
			baseProducts: new Map(),
		});

		expect(rows).toEqual([
			expect.objectContaining({
				customer_product_id: customerProduct.id,
				reason: "matches_catalog",
				diff: null,
			}),
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("custom-plans export 2: customized at attach -> customized row carries the diff")}`,
	async () => {
		const { ctx, scalar, customerProduct } = await setupCustomer({
			customerId: "custom-plans-export-customized",
			customize: { items: [itemsV2.monthlyMessages({ included: 250 })] },
		});
		expect(customerProduct.is_custom).toBe(true);

		const rows = await customerToCustomPlansExportRows({
			ctx,
			scalar,
			filters: {},
			baseProducts: new Map(),
		});

		expect(rows).toEqual([
			expect.objectContaining({
				customer_product_id: customerProduct.id,
				reason: "customized",
				changes: "messages: included 100 → 250",
			}),
		]);
	},
);

const testWithS3 = isCustomerExportsS3Configured() ? test : test.skip;

testWithS3(
	`${chalk.yellowBright("custom-plans export 3: job runs end to end -> downloadable CSV, one row per plan")}`,
	async () => {
		const searchTerm = "custom-plans-export-job";
		const { ctx, customerProduct } = await setupCustomer({
			customerId: `${searchTerm}-customer`,
		});
		await ctx.db
			.update(customerProducts)
			.set({ is_custom: true })
			.where(eq(customerProducts.id, customerProduct.id));

		const created = await CustomerExportService.createIfNoneActive({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			kind: CustomerExportKind.CustomPlans,
			fields: [],
			snapshot: { search: searchTerm, filters: {} },
		});
		if (!created.created) {
			throw new Error("A custom plans export is already active");
		}
		const exportId = created.customerExport.id;

		try {
			await executeCustomerExport({
				ctx,
				logger: ctx.logger,
				payload: { exportId, orgId: ctx.org.id, env: ctx.env },
			});

			const completed = await CustomerExportService.get({
				db: ctx.db,
				id: exportId,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			expect(completed?.status).toBe(CustomerExportStatus.Completed);
			expect(completed?.row_count).toBe(1);

			const download = await downloadCustomerExport({ ctx, exportId });
			expect(download.file_name).toBe("custom-plans.csv");

			const csv = await (await fetch(download.url)).text();
			expect(csv).toContain(customerProduct.id);
			expect(csv).toContain("matches_catalog");
		} finally {
			await ctx.db
				.delete(customerExports)
				.where(eq(customerExports.id, exportId));
		}
	},
);
