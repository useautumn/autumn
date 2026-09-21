import { BILLING_VERIFY_EXPORT_COLUMNS } from "@autumn/shared";
import { stringify } from "csv-stringify";

export const createBillingVerifyExportStringifier = () =>
	stringify({
		// Include a BOM so Excel reliably detects UTF-8.
		bom: true,
		header: true,
		columns: [...BILLING_VERIFY_EXPORT_COLUMNS],
		escape_formulas: true,
		record_delimiter: "windows",
	});
