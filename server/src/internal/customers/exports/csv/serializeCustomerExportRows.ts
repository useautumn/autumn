import {
	CUSTOMER_EXPORT_FIELD_HEADERS,
	CUSTOMER_EXPORT_FIELD_ORDER,
	CustomerExportField,
} from "@autumn/shared";

const BOM_CODE_POINT = 0xfe_ff;

/** Excel only detects UTF-8 when the file opens with a byte order mark. */
export const UTF8_BOM = String.fromCharCode(BOM_CODE_POINT);
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

const FORMULA_TRIGGER_PATTERN = /^[=+\-@\t\r]/;

const NEEDS_QUOTING = /[",\r\n]/;

/** Spreadsheets evaluate cells starting with these; a leading quote neutralises it. */
const guardAgainstFormulaInjection = (value: string) =>
	FORMULA_TRIGGER_PATTERN.test(value) ? `'${value}` : value;

export const escapeCsvCell = (value: string) => {
	const guarded = guardAgainstFormulaInjection(value);
	if (!NEEDS_QUOTING.test(guarded)) return guarded;
	return `"${guarded.replaceAll('"', '""')}"`;
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

const listCellToString = (values: string[]) =>
	values.length === 0 ? "" : values.join(CSV_LIST_SEPARATOR);

const rowFieldToString = ({
	row,
	field,
}: {
	row: CustomerExportRow;
	field: CustomerExportField;
}) => {
	switch (field) {
		case CustomerExportField.Name:
			return row.name ?? "";
		case CustomerExportField.Email:
			return row.email ?? "";
		case CustomerExportField.CustomerId:
			return row.customer_id ?? "";
		case CustomerExportField.Subscriptions:
			return listCellToString(row.subscriptions);
		case CustomerExportField.Purchases:
			return listCellToString(row.purchases);
		case CustomerExportField.Licenses:
			return listCellToString(row.licenses);
		default:
			return "";
	}
};

export const buildCustomerExportHeaderLine = ({
	fields,
}: {
	fields: CustomerExportField[];
}) =>
	orderCustomerExportFields({ fields })
		.map((field) => escapeCsvCell(CUSTOMER_EXPORT_FIELD_HEADERS[field]))
		.join(",");

const serializeRowWithOrderedFields = ({
	row,
	orderedFields,
}: {
	row: CustomerExportRow;
	orderedFields: CustomerExportField[];
}) =>
	orderedFields
		.map((field) => escapeCsvCell(rowFieldToString({ row, field })))
		.join(",");

export const serializeCustomerExportRow = ({
	row,
	fields,
}: {
	row: CustomerExportRow;
	fields: CustomerExportField[];
}) =>
	serializeRowWithOrderedFields({
		row,
		orderedFields: orderCustomerExportFields({ fields }),
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
	const lines = rows.map((row) =>
		serializeRowWithOrderedFields({ row, orderedFields }),
	);

	if (includeHeader) {
		lines.unshift(buildCustomerExportHeaderLine({ fields }));
	}

	const body = lines.map((line) => `${line}${CSV_ROW_SEPARATOR}`).join("");

	return includeHeader ? `${UTF8_BOM}${body}` : body;
};
