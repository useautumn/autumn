import { describe, expect, it } from "bun:test";
import { CustomerExportField } from "@autumn/shared";
import {
	type CustomerExportRow,
	createCustomerExportStringifier,
} from "@/internal/customers/exports/csv/createCustomerExportStringifier.js";

const UTF8_BOM = "\uFEFF";
const CSV_ROW_SEPARATOR = "\r\n";

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

const stringifyRows = async ({
	fields,
	rows,
}: {
	fields: CustomerExportField[];
	rows: CustomerExportRow[];
}) => {
	const stringifier = createCustomerExportStringifier({ fields });
	for (const row of rows) {
		stringifier.write(row);
	}
	stringifier.end();

	let output = "";
	for await (const chunk of stringifier) {
		output += chunk.toString();
	}
	return output;
};

describe("createCustomerExportStringifier", () => {
	it("orders columns canonically regardless of selection order", async () => {
		const output = await stringifyRows({
			fields: [
				CustomerExportField.Licenses,
				CustomerExportField.Email,
				CustomerExportField.Name,
			],
			rows: [],
		});

		expect(output).toBe(`${UTF8_BOM}Name,Email,Licenses${CSV_ROW_SEPARATOR}`);
	});

	it("opens the file with the BOM and the header row", async () => {
		const output = await stringifyRows({
			fields: ALL_FIELDS,
			rows: [buildRow()],
		});

		expect(output.startsWith(UTF8_BOM)).toBe(true);
		expect(output.split(CSV_ROW_SEPARATOR)[0]).toBe(
			`${UTF8_BOM}Name,Email,Customer ID,Plans,Purchases,Licenses`,
		);
	});

	it("terminates every row with CRLF", async () => {
		const output = await stringifyRows({
			fields: [CustomerExportField.CustomerId],
			rows: [buildRow(), buildRow({ customer_id: "cus_2" })],
		});

		expect(output).toBe(`${UTF8_BOM}Customer ID\r\ncus_1\r\ncus_2\r\n`);
	});

	it("quotes CSV syntax and guards formula-injection prefixes", async () => {
		const output = await stringifyRows({
			fields: [
				CustomerExportField.Name,
				CustomerExportField.Email,
				CustomerExportField.CustomerId,
			],
			rows: [
				buildRow({
					name: "Doe, Jane",
					email: "=1+1",
					customer_id: 'say "hi"',
				}),
			],
		});

		expect(output.split(CSV_ROW_SEPARATOR)[1]).toBe(
			`"Doe, Jane",'=1+1,"say ""hi"""`,
		);
	});

	it("joins list cells and blanks empty ones", async () => {
		const output = await stringifyRows({
			fields: [
				CustomerExportField.Subscriptions,
				CustomerExportField.Purchases,
				CustomerExportField.Licenses,
			],
			rows: [
				buildRow({
					subscriptions: ["pro", "analytics"],
					purchases: [],
					licenses: ["seat"],
				}),
			],
		});

		expect(output.split(CSV_ROW_SEPARATOR)[1]).toBe(`"pro, analytics",,seat`);
	});

	it("renders null scalars as empty cells", async () => {
		const output = await stringifyRows({
			fields: [
				CustomerExportField.Name,
				CustomerExportField.Email,
				CustomerExportField.CustomerId,
			],
			rows: [buildRow({ name: null, email: null, customer_id: null })],
		});

		expect(output.split(CSV_ROW_SEPARATOR)[1]).toBe(",,");
	});
});
