import {
	CUSTOMER_EXPORT_FIELD_HEADERS,
	CUSTOMER_EXPORT_FIELD_ORDER,
	type CustomerExportField,
} from "@autumn/shared";

import { stringify } from "csv-stringify";

export type CustomerExportRow = {
	name: string | null;
	email: string | null;
	customer_id: string | null;
	subscriptions: string[];
	purchases: string[];
	licenses: string[];
};

const toOrderedColumns = ({ fields }: { fields: CustomerExportField[] }) => {
	const selected = new Set(fields);
	return CUSTOMER_EXPORT_FIELD_ORDER.filter((field) => selected.has(field)).map(
		(field) => ({ key: field, header: CUSTOMER_EXPORT_FIELD_HEADERS[field] }),
	);
};

export const createCustomerExportStringifier = ({
	fields,
}: {
	fields: CustomerExportField[];
}) =>
	stringify({
		// Include a BOM so Excel reliably detects UTF-8.
		bom: true,
		header: true,
		columns: toOrderedColumns({ fields }),
		cast: {
			object: (value) => (Array.isArray(value) ? value.join(", ") : ""),
		},
		escape_formulas: true,
		record_delimiter: "windows",
	});
