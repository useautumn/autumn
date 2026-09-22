import { BILLING_VERIFY_EXPORT_COLUMNS } from "@autumn/shared";
import { stringify } from "csv-stringify";
import { CSV_EXPORT_STRINGIFY_OPTIONS } from "./csvExportStringifyOptions.js";

export const createBillingVerifyExportStringifier = () =>
	stringify({
		...CSV_EXPORT_STRINGIFY_OPTIONS,
		columns: [...BILLING_VERIFY_EXPORT_COLUMNS],
	});
