import type { z } from "zod/v4";
import type { RepointBatchResultSchema } from "../../types/repointBatchResult.js";
import type { CompactRepointBatchResult } from "./types/compactRepointBatchResult.js";

export const repointBatchResultToCompact = ({
	result,
}: {
	result: z.infer<typeof RepointBatchResultSchema>;
}): CompactRepointBatchResult => {
	const format = "compact-repoint-v1";
	const firstRow = result.rows[0];
	if (!firstRow) return { format, defaults: null, rows: [] };

	const {
		internalCustomerId: _internalCustomerId,
		customerProductId: _customerProductId,
		...defaults
	} = firstRow;
	const defaultFields = Object.keys(defaults) as (keyof typeof defaults)[];
	const rows = result.rows.map((item) => {
		const row: CompactRepointBatchResult["rows"][number] = { ...item };
		for (const field of defaultFields) {
			if (row[field] === defaults[field]) delete row[field];
		}
		return row;
	});

	return { format, defaults, rows };
};
