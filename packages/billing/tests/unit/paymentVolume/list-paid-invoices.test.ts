import { describe, expect, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
	listPaidInvoices,
	paidInvoicesSql,
} from "../../../src/paymentVolume/repos/listPaidInvoices";
import { fakeDb, paidRow } from "./fakes";

const HOUR = 60 * 60 * 1000;
const START = Date.parse("2026-09-27T11:00:00Z");
const window = { startMs: START, endMs: START + HOUR };

const render = (query: SQL) => new PgDialect().sqlToQuery(query);

describe("paidInvoicesSql", () => {
	test("reads collected money from live customers inside the hour, oldest first", () => {
		const { sql, params } = render(paidInvoicesSql({ windows: [window] }));
		expect(sql).toContain("COALESCE(i.amount_paid, i.total)");
		expect(sql).toContain("(i.paid_at >= $1 AND i.paid_at < $2)");
		expect(sql).toContain("c.env = 'live'");
		expect(sql).toContain("JOIN organizations o ON o.id = c.org_id");
		expect(sql).toContain("ORDER BY i.paid_at, i.id");
		expect(params).toEqual([START, START + HOUR]);
	});

	test("several windows become one query with OR'd ranges", () => {
		const later = { startMs: START + 2 * HOUR, endMs: START + 3 * HOUR };
		const { sql, params } = render(
			paidInvoicesSql({ windows: [window, later] }),
		);
		expect(sql).toContain(
			"(i.paid_at >= $1 AND i.paid_at < $2) OR (i.paid_at >= $3 AND i.paid_at < $4)",
		);
		expect(params).toEqual([
			START,
			START + HOUR,
			START + 2 * HOUR,
			START + 3 * HOUR,
		]);
	});
});

describe("listPaidInvoices", () => {
	test("rows become invoices with numeric amounts and epoch paid_at", async () => {
		const queries: SQL[] = [];
		const db = fakeDb({
			queries,
			rows: [
				paidRow({ amount: "1500", currency: "jpy", processor_type: null }),
			],
		});
		const invoices = await listPaidInvoices({ ctx: { db }, windows: [window] });
		expect(queries).toHaveLength(1);
		expect(invoices).toEqual([
			{
				id: "inv_1",
				stripeId: "in_1",
				processorType: null,
				orgId: "org_a",
				orgSlug: "acme",
				currency: "jpy",
				amount: 1500,
				paidAtMs: Date.parse("2026-09-27T11:20:00Z"),
			},
		]);
	});

	test("a row missing a column fails the run instead of being guessed", async () => {
		const db = fakeDb({ queries: [], rows: [paidRow({ org_id: undefined })] });
		await expect(
			listPaidInvoices({ ctx: { db }, windows: [window] }),
		).rejects.toThrow("Unexpected paid invoice row");
	});

	test("no windows means no query", async () => {
		const queries: SQL[] = [];
		const db = fakeDb({ queries, rows: [paidRow()] });
		expect(await listPaidInvoices({ ctx: { db }, windows: [] })).toEqual([]);
		expect(queries).toHaveLength(0);
	});
});
