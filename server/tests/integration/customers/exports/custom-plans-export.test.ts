/** Custom plans export: report rows, apply writes with compare-and-set, and the S3 job end to end. */

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
import { loadBaseProduct } from "@/internal/customers/cusProducts/actions/deriveIsCustom/loadBaseProduct";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos/index";
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
			snapshot: { search: "", filters: {}, apply: false },
			baseProducts: new Map(),
		});

		expect(rows).toEqual([
			expect.objectContaining({
				customer_product_id: customerProduct.id,
				outcome: "matches_catalog",
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
			snapshot: { search: "", filters: {}, apply: false },
			baseProducts: new Map(),
		});

		expect(rows).toEqual([
			expect.objectContaining({
				customer_product_id: customerProduct.id,
				outcome: "customized",
				reasons: "item_changed:messages",
				changes: "messages: included 100 → 250",
			}),
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("custom-plans export 3: apply run clears a wrong flag once")}`,
	async () => {
		const { ctx, scalar, customerProduct } = await setupCustomer({
			customerId: "custom-plans-export-apply",
		});
		await ctx.db
			.update(customerProducts)
			.set({ is_custom: true })
			.where(eq(customerProducts.id, customerProduct.id));

		const snapshot = { search: "", filters: {}, apply: true };
		const appliedRows = await customerToCustomPlansExportRows({
			ctx,
			scalar,
			snapshot,
			baseProducts: new Map(),
		});
		expect(appliedRows).toEqual([
			expect.objectContaining({
				outcome: "matches_catalog",
				applied: "true",
			}),
		]);

		const refreshed = await CusService.getFull({
			ctx,
			idOrInternalId: scalar.internal_id,
		});
		expect(
			refreshed.customer_products.find(
				(cusProduct) => cusProduct.id === customerProduct.id,
			)?.is_custom,
		).toBe(false);

		const rerunRows = await customerToCustomPlansExportRows({
			ctx,
			scalar,
			snapshot,
			baseProducts: new Map(),
		});
		expect(rerunRows).toEqual([
			expect.objectContaining({
				outcome: "matches_catalog",
				applied: "false",
			}),
		]);
	},
);

test.concurrent(
	`${chalk.yellowBright("custom-plans export 4: apply leaves a row another write changed since it was read")}`,
	async () => {
		const { ctx, scalar, customerProduct } = await setupCustomer({
			customerId: "custom-plans-export-apply-race",
		});
		await ctx.db
			.update(customerProducts)
			.set({ is_custom: true, updated_at: 1 })
			.where(eq(customerProducts.id, customerProduct.id));

		const write = ({
			from,
			readUpdatedAt,
		}: {
			from: boolean;
			readUpdatedAt: number;
		}) =>
			customerProductRepo.setIsCustom({
				ctx,
				internalCustomerId: scalar.internal_id,
				customerProductId: customerProduct.id,
				from,
				to: false,
				readUpdatedAt,
			});

		// The flag moved since the read.
		expect(await write({ from: false, readUpdatedAt: 1 })).toBe(false);
		// The plan was written since the read.
		expect(await write({ from: true, readUpdatedAt: 0 })).toBe(false);

		const [row] = await ctx.db
			.select({ isCustom: customerProducts.is_custom })
			.from(customerProducts)
			.where(eq(customerProducts.id, customerProduct.id));
		expect(row?.isCustom).toBe(true);

		expect(await write({ from: true, readUpdatedAt: 1 })).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("custom-plans export 4b: apply rechecks a flip against a fresh catalog read")}`,
	async () => {
		const { ctx, scalar, customerProduct } = await setupCustomer({
			customerId: "custom-plans-export-stale-catalog",
			customize: { items: [itemsV2.monthlyMessages({ included: 250 })] },
		});
		expect(customerProduct.is_custom).toBe(true);

		// The run's cached catalog says 250, as if the version was edited in place mid-run.
		const catalog = await loadBaseProduct({
			ctx,
			internalProductId: customerProduct.internal_product_id,
		});
		if (!catalog) throw new Error("Catalog version missing");
		const staleCatalog = {
			...catalog,
			entitlements: catalog.entitlements.map((entitlement) => ({
				...entitlement,
				allowance: 250,
			})),
		};

		const rows = await customerToCustomPlansExportRows({
			ctx,
			scalar,
			snapshot: { search: "", filters: {}, apply: true },
			baseProducts: new Map([
				[customerProduct.internal_product_id, Promise.resolve(staleCatalog)],
			]),
		});

		expect(rows).toEqual([
			expect.objectContaining({
				customer_product_id: customerProduct.id,
				outcome: "customized",
				applied: "false",
			}),
		]);
		const [row] = await ctx.db
			.select({ isCustom: customerProducts.is_custom })
			.from(customerProducts)
			.where(eq(customerProducts.id, customerProduct.id));
		expect(row?.isCustom).toBe(true);
	},
);

const testWithS3 = isCustomerExportsS3Configured() ? test : test.skip;

testWithS3(
	`${chalk.yellowBright("custom-plans export 5: job runs end to end -> downloadable CSV, one row per plan")}`,
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
