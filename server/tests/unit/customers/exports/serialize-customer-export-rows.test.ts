import { describe, expect, it } from "bun:test";
import { CustomerExportField } from "@autumn/shared";
import {
	CSV_ROW_SEPARATOR,
	type CustomerExportRow,
	escapeCsvCell,
	orderCustomerExportFields,
	serializeCustomerExportRows,
	UTF8_BOM,
} from "@/internal/customers/exports/csv/serializeCustomerExportRows.js";

const ALL_FIELDS = [
	CustomerExportField.Name,
	CustomerExportField.Email,
	CustomerExportField.CustomerId,
	CustomerExportField.Subscriptions,
	CustomerExportField.Purchases,
	CustomerExportField.Licenses,
];

const buildRow = (
	overrides: Partial<CustomerExportRow> = {},
): CustomerExportRow => ({
	name: "Jane",
	email: "jane@example.com",
	customer_id: "cus_1",
	subscriptions: [],
	purchases: [],
	licenses: [],
	...overrides,
});

describe("escapeCsvCell", () => {
	it("leaves plain values untouched", () => {
		expect(escapeCsvCell("Jane")).toBe("Jane");
	});

	it("quotes values containing commas, quotes or newlines", () => {
		expect(escapeCsvCell("Doe, Jane")).toBe('"Doe, Jane"');
		expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
		expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
	});

	it("guards formula-injection prefixes", () => {
		expect(escapeCsvCell("=1+1")).toBe("'=1+1");
		expect(escapeCsvCell("+cmd")).toBe("'+cmd");
		expect(escapeCsvCell("-cmd")).toBe("'-cmd");
		expect(escapeCsvCell("@cmd")).toBe("'@cmd");
		expect(escapeCsvCell("\tcmd")).toBe("'\tcmd");
	});

	it("quotes a guarded value that also needs quoting", () => {
		expect(escapeCsvCell("=a,b")).toBe(`"'=a,b"`);
	});
});

describe("orderCustomerExportFields", () => {
	it("returns the canonical order regardless of selection order", () => {
		expect(
			orderCustomerExportFields({
				fields: [
					CustomerExportField.Licenses,
					CustomerExportField.Email,
					CustomerExportField.Name,
				],
			}),
		).toEqual([
			CustomerExportField.Name,
			CustomerExportField.Email,
			CustomerExportField.Licenses,
		]);
	});
});

describe("serializeCustomerExportRows", () => {
	it("prepends the BOM and header only when includeHeader is set", () => {
		const output = serializeCustomerExportRows({
			rows: [buildRow()],
			fields: ALL_FIELDS,
			includeHeader: true,
		});

		expect(output.startsWith(UTF8_BOM)).toBe(true);
		expect(output.split(CSV_ROW_SEPARATOR)[0]).toBe(
			`${UTF8_BOM}Name,Email,Customer ID,Subscriptions,Purchases,Licenses`,
		);
	});

	it("omits the BOM and header for non-first parts", () => {
		const output = serializeCustomerExportRows({
			rows: [buildRow()],
			fields: ALL_FIELDS,
		});

		expect(output.startsWith(UTF8_BOM)).toBe(false);
		expect(output).toBe(`Jane,jane@example.com,cus_1,,,${CSV_ROW_SEPARATOR}`);
	});

	it("terminates every row with CRLF", () => {
		const output = serializeCustomerExportRows({
			rows: [buildRow(), buildRow({ customer_id: "cus_2" })],
			fields: [CustomerExportField.CustomerId],
		});

		expect(output).toBe(`cus_1\r\ncus_2\r\n`);
	});

	it("joins list cells and blanks empty ones", () => {
		const output = serializeCustomerExportRows({
			rows: [
				buildRow({
					subscriptions: ["pro", "analytics"],
					purchases: [],
					licenses: ["seat"],
				}),
			],
			fields: [
				CustomerExportField.Subscriptions,
				CustomerExportField.Purchases,
				CustomerExportField.Licenses,
			],
		});

		expect(output).toBe(`"pro, analytics",,seat${CSV_ROW_SEPARATOR}`);
	});

	it("renders null scalars as empty cells", () => {
		const output = serializeCustomerExportRows({
			rows: [buildRow({ name: null, email: null, customer_id: null })],
			fields: [
				CustomerExportField.Name,
				CustomerExportField.Email,
				CustomerExportField.CustomerId,
			],
		});

		expect(output).toBe(`,,${CSV_ROW_SEPARATOR}`);
	});

	it("writes a header-only file when there are no rows", () => {
		const output = serializeCustomerExportRows({
			rows: [],
			fields: [CustomerExportField.Name],
			includeHeader: true,
		});

		expect(output).toBe(`${UTF8_BOM}Name${CSV_ROW_SEPARATOR}`);
	});
});
