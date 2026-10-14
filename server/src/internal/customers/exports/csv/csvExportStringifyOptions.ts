import type { Options } from "csv-stringify";

export const CSV_EXPORT_STRINGIFY_OPTIONS = {
	bom: true,
	header: true,
	escape_formulas: true,
	record_delimiter: "windows",
} satisfies Options;
