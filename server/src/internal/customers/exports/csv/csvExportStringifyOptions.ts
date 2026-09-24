import type { Options } from "csv-stringify";

export const CSV_EXPORT_STRINGIFY_OPTIONS = {
	// Include a BOM so Excel reliably detects UTF-8.
	bom: true,
	header: true,
	escape_formulas: true,
	record_delimiter: "windows",
} satisfies Options;
