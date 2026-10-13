import { CUSTOM_PLANS_EXPORT_COLUMNS } from "@autumn/shared";
import { stringify } from "csv-stringify";
import { CSV_EXPORT_STRINGIFY_OPTIONS } from "./csvExportStringifyOptions.js";

export const createCustomPlansExportStringifier = () =>
	stringify({
		...CSV_EXPORT_STRINGIFY_OPTIONS,
		columns: [...CUSTOM_PLANS_EXPORT_COLUMNS],
	});
