import { describe, expect, test } from "bun:test";
import { invoices } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
	invoiceJsonWithCurrentPlanIdsSql,
	resolvedInvoiceProductIdsSql,
} from "@/internal/invoices/resolvedInvoiceProductIdsSql.js";

const dialect = new PgDialect();
const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

describe("resolvedInvoiceProductIdsSql", () => {
	test("looks up current public ids from products via internal_product_ids", () => {
		const { sql: query } = dialect.sqlToQuery(
			resolvedInvoiceProductIdsSql({
				internalProductIds: invoices.internal_product_ids,
				productIds: invoices.product_ids,
			}),
		);

		const normalized = normalize(query);
		expect(normalized).toContain("LEFT JOIN products p");
		expect(normalized).toContain("unnest(");
		expect(normalized).toContain('"internal_product_ids"');
		expect(normalized).toContain('"product_ids"');
	});

	test("invoice JSON overlay replaces product_ids in place", () => {
		const { sql: query } = dialect.sqlToQuery(
			sql`SELECT ${invoiceJsonWithCurrentPlanIdsSql("i")} FROM invoices i`,
		);

		const normalized = normalize(query);
		expect(normalized).toContain("to_jsonb(i)");
		expect(normalized).toContain("jsonb_build_object");
		expect(normalized).toContain("LEFT JOIN products p");
		expect(normalized).toContain("i.internal_product_ids");
	});
});
