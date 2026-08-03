import {
	CUSTOMER_EXPORT_FIELD_HEADERS,
	CUSTOMER_EXPORT_FIELD_ORDER,
	type CustomerExportField,
} from "@autumn/shared";

import { stringify } from "csv-stringify/sync";

/** Excel only detects UTF-8 when the file opens with a byte order mark. */
export const UTF8_BOM = "\uFEFF";
export const CSV_ROW_SEPARATOR = "\r\n";
export const CSV_LIST_SEPARATOR = ", ";

export type CustomerExportRow = {
	name: string | null;
	email: string | null;
	customer_id: string | null;
	subscriptions: string[];
	purchases: string[];
	licenses: string[];
};
/** Selection order never reaches the file — columns always follow the canonical order. */
export const orderCustomerExportFields = ({
	fields,
}: {
	fields: CustomerExportField[];
}): CustomerExportField[] => {
	const selected = new Set(fields);
	return CUSTOMER_EXPORT_FIELD_ORDER.filter((field) => selected.has(field));
};

const rowToRecord = ({
	row,
	orderedFields,
}: {
	row: CustomerExportRow;
	orderedFields: CustomerExportField[];
}) =>
	orderedFields.map((field) => {
		const value = row[field];
		return Array.isArray(value)
			? value.join(CSV_LIST_SEPARATOR)
			: (value ?? "");
	});

/** `includeHeader` is true only for the first chunk, which also owns the BOM. */
export const serializeCustomerExportRows = ({
	rows,
	fields,
	includeHeader = false,
}: {
	rows: CustomerExportRow[];
	fields: CustomerExportField[];
	includeHeader?: boolean;
}) => {
	const orderedFields = orderCustomerExportFields({ fields });
	const records = rows.map((row) => rowToRecord({ row, orderedFields }));

	if (includeHeader) {
		records.unshift(
			orderedFields.map((field) => CUSTOMER_EXPORT_FIELD_HEADERS[field]),
		);
	}

	return stringify(records, {
		bom: includeHeader,
		escape_formulas: true,
		record_delimiter: "windows",
	});
};
