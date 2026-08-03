import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	CustomerExportField,
	CustomerExportStatus,
	customerExports,
	customerProducts,
	customers,
	products,
} from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { and, eq, inArray } from "drizzle-orm";
import { CusSearchService } from "@/internal/customers/CusSearchService.js";
import { CustomerExportService } from "@/internal/customers/exports/CustomerExportService.js";
import { getCustomerExportScalars } from "@/internal/customers/exports/queries/getCustomerExportScalars.js";
import { generateId } from "@/utils/genUtils.js";

// Mirrors the other integration suites: skip entirely without a seeded org.
const describeDb = process.env.TESTS_ORG ? describe : describe.skip;

const TEST_PREFIX = "customer-export-jobs";
const SEARCH_TERM = `${TEST_PREFIX}-match`;
const ALL_FIELDS = [
	CustomerExportField.Name,
	CustomerExportField.Email,
	CustomerExportField.CustomerId,
	CustomerExportField.Subscriptions,
	CustomerExportField.Purchases,
	CustomerExportField.Licenses,
];

const emptySnapshot = { search: "", filters: {} };

describeDb("customer export jobs", () => {
	const seededCustomerInternalIds: string[] = [];
	const seededExportIds: string[] = [];
	const seededCustomerProductIds: string[] = [];
	const seededProductInternalIds: string[] = [];
	const otherEnv = ctx.env === "sandbox" ? "live" : "sandbox";

	const insertExport = async ({
		status,
		env = ctx.env,
		orgId = ctx.org.id,
		createdAt = Date.now(),
	}: {
		status: CustomerExportStatus;
		env?: string;
		orgId?: string;
		createdAt?: number;
	}) => {
		const id = generateId("cusexp");
		await ctx.db.insert(customerExports).values({
			id,
			org_id: orgId,
			env,
			status,
			fields: ALL_FIELDS,
			snapshot: emptySnapshot,
			created_at: createdAt,
		});
		seededExportIds.push(id);
		return id;
	};

	beforeAll(async () => {
		for (let index = 0; index < 3; index++) {
			const internalId = generateId("cus");
			seededCustomerInternalIds.push(internalId);
			await ctx.db.insert(customers).values({
				internal_id: internalId,
				org_id: ctx.org.id,
				env: ctx.env,
				created_at: Date.now(),
				id: `${SEARCH_TERM}-${index}`,
				name: `${SEARCH_TERM}-${index}`,
				email: `${SEARCH_TERM}-${index}@example.com`,
			});
		}
	});

	afterAll(async () => {
		if (seededExportIds.length > 0) {
			await ctx.db
				.delete(customerExports)
				.where(inArray(customerExports.id, seededExportIds));
		}
		if (seededCustomerProductIds.length > 0) {
			await ctx.db
				.delete(customerProducts)
				.where(inArray(customerProducts.id, seededCustomerProductIds));
		}
		if (seededCustomerInternalIds.length > 0) {
			await ctx.db
				.delete(customers)
				.where(inArray(customers.internal_id, seededCustomerInternalIds));
		}
		if (seededProductInternalIds.length > 0) {
			await ctx.db
				.delete(products)
				.where(inArray(products.internal_id, seededProductInternalIds));
		}
	});

	test("only one queued or running export exists per org and env", async () => {
		const first = await CustomerExportService.create({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			fields: ALL_FIELDS,
			snapshot: emptySnapshot,
		});
		expect(first.created).toBe(true);
		if (first.created) seededExportIds.push(first.customerExport.id);

		const second = await CustomerExportService.create({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			fields: ALL_FIELDS,
			snapshot: emptySnapshot,
		});

		expect(second.created).toBe(false);
		if (!second.created) {
			expect(second.activeExport?.id).toBe(
				first.created ? first.customerExport.id : "",
			);
		}

		// A completed export frees the slot again.
		if (first.created) {
			await CustomerExportService.markCompleted({
				db: ctx.db,
				id: first.customerExport.id,
				rowCount: 0,
				byteCount: 0,
			});
		}

		const third = await CustomerExportService.create({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			fields: ALL_FIELDS,
			snapshot: emptySnapshot,
		});
		expect(third.created).toBe(true);
		if (third.created) {
			seededExportIds.push(third.customerExport.id);
			await CustomerExportService.markFailed({
				db: ctx.db,
				id: third.customerExport.id,
				errorMessage: "cleanup",
			});
		}
	});

	test("exports are scoped to the requesting org and env", async () => {
		const sameEnvId = await insertExport({
			status: CustomerExportStatus.Completed,
		});
		const otherEnvId = await insertExport({
			status: CustomerExportStatus.Completed,
			env: otherEnv,
		});

		const listed = await CustomerExportService.list({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			limit: 20,
		});
		const listedIds = listed.map((row) => row.id);

		expect(listedIds).toContain(sameEnvId);
		expect(listedIds).not.toContain(otherEnvId);

		const wrongEnvLookup = await CustomerExportService.get({
			db: ctx.db,
			id: otherEnvId,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(wrongEnvLookup).toBeNull();
	});

	test("lists newest first and respects the limit", async () => {
		const now = Date.now();
		const olderId = await insertExport({
			status: CustomerExportStatus.Completed,
			createdAt: now - 2000,
		});
		const newerId = await insertExport({
			status: CustomerExportStatus.Completed,
			createdAt: now - 1000,
		});

		const listed = await CustomerExportService.list({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			limit: 20,
		});
		const listedIds = listed.map((row) => row.id);

		expect(listed.length).toBeLessThanOrEqual(20);
		expect(listedIds).toContain(newerId);
		expect(listedIds).toContain(olderId);
		expect(listedIds.indexOf(newerId)).toBeLessThan(listedIds.indexOf(olderId));
		for (const [index, row] of listed.entries()) {
			const next = listed[index + 1];
			if (next) expect(row.created_at).toBeGreaterThanOrEqual(next.created_at);
		}
	});

	test("only completed exports carry a downloadable key", async () => {
		const queuedId = await insertExport({
			status: CustomerExportStatus.Queued,
		});
		const failedId = await insertExport({
			status: CustomerExportStatus.Failed,
		});

		for (const id of [queuedId, failedId]) {
			const row = await CustomerExportService.get({
				db: ctx.db,
				id,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			expect(row?.status).not.toBe(CustomerExportStatus.Completed);
			expect(row?.s3_key).toBeNull();
		}

		await ctx.db
			.update(customerExports)
			.set({ status: CustomerExportStatus.Completed, s3_key: "key" })
			.where(eq(customerExports.id, queuedId));

		const completed = await CustomerExportService.get({
			db: ctx.db,
			id: queuedId,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		expect(completed?.s3_key).toBe("key");
	});

	test("export walk membership matches the dashboard search", async () => {
		const snapshot = { search: SEARCH_TERM, filters: {} };

		const { totalCount } = await CusSearchService.count({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			search: snapshot.search,
			filters: snapshot.filters,
		});

		// A page size of 2 forces the keyset cursor to advance across pages.
		const pageSize = 2;
		const walkedInternalIds: string[] = [];
		let afterInternalId: string | null = null;
		for (;;) {
			const page = await getCustomerExportScalars({
				db: ctx.db,
				orgId: ctx.org.id,
				env: ctx.env,
				snapshot,
				afterInternalId,
				limit: pageSize,
			});
			if (page.length === 0) break;
			walkedInternalIds.push(...page.map((row) => row.internal_id));
			afterInternalId = page[page.length - 1].internal_id;
			if (page.length < pageSize) break;
		}

		expect(walkedInternalIds.length).toBe(totalCount);
		expect(new Set(walkedInternalIds).size).toBe(walkedInternalIds.length);

		const expectedRows = await ctx.db
			.select({ internal_id: customers.internal_id })
			.from(customers)
			.where(
				and(
					eq(customers.org_id, ctx.org.id),
					eq(customers.env, ctx.env),
					inArray(customers.internal_id, seededCustomerInternalIds),
				),
			);

		for (const row of expectedRows) {
			expect(walkedInternalIds).toContain(row.internal_id);
		}
	});

	test("filtered export walk matches the dashboard count for plan and status filters", async () => {
		const planId = `${TEST_PREFIX}-plan`;
		const internalProductId = generateId("prod");
		await ctx.db.insert(products).values({
			internal_id: internalProductId,
			id: planId,
			org_id: ctx.org.id,
			env: ctx.env,
		});
		seededProductInternalIds.push(internalProductId);

		const attachPlan = async ({
			customerIndex,
			status,
		}: {
			customerIndex: number;
			status: CusProductStatus;
		}) => {
			const id = generateId("cusprod");
			await ctx.db.insert(customerProducts).values({
				id,
				internal_customer_id: seededCustomerInternalIds[customerIndex],
				internal_product_id: internalProductId,
				product_id: planId,
				status,
				created_at: Date.now(),
			});
			seededCustomerProductIds.push(id);
		};
		await attachPlan({ customerIndex: 0, status: CusProductStatus.Active });
		await attachPlan({ customerIndex: 1, status: CusProductStatus.Active });
		await attachPlan({ customerIndex: 2, status: CusProductStatus.Expired });

		const snapshot = {
			search: SEARCH_TERM,
			filters: { status: ["active"], version: [`${planId}:1`] },
		};

		const { totalCount } = await CusSearchService.count({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			search: snapshot.search,
			filters: snapshot.filters,
		});

		// A page size of 1 forces the keyset cursor through the filtered walk.
		const pageSize = 1;
		const walkedInternalIds: string[] = [];
		let afterInternalId: string | null = null;
		for (;;) {
			const page = await getCustomerExportScalars({
				db: ctx.db,
				orgId: ctx.org.id,
				env: ctx.env,
				snapshot,
				afterInternalId,
				limit: pageSize,
			});
			if (page.length === 0) break;
			walkedInternalIds.push(...page.map((row) => row.internal_id));
			afterInternalId = page[page.length - 1].internal_id;
			if (page.length < pageSize) break;
		}

		const expectedInternalIds = [
			seededCustomerInternalIds[0],
			seededCustomerInternalIds[1],
		];
		expect(walkedInternalIds.length).toBe(totalCount);
		expect([...walkedInternalIds].sort()).toEqual(
			[...expectedInternalIds].sort(),
		);
		expect(walkedInternalIds).not.toContain(seededCustomerInternalIds[2]);
	});
});
