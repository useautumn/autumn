import type { z } from "zod/v4";
import type { AddBatchResultSchema } from "../../../actions/addCustomerEntitlementsForPage/types/addBatchResult.js";
import type { CompactAddBatchResult } from "./types/compactAddBatchResult.js";

export const addBatchResultToCompact = ({
	result,
}: {
	result: z.infer<typeof AddBatchResultSchema>;
}): CompactAddBatchResult => {
	const batch = {
		format: "compact-add-v1" as const,
		candidates: result.candidates,
		excludedInternalCustomerIds: result.excludedInternalCustomerIds,
	};
	const firstItem = result.insertedItems[0];
	if (!firstItem) return { ...batch, defaults: null, rows: [] };

	const {
		internalCustomerId: _internalCustomerId,
		customerProductId: _customerProductId,
		remaining: _remaining,
		...defaults
	} = firstItem;
	const defaultFields = Object.keys(defaults) as (keyof typeof defaults)[];
	const rows = result.insertedItems.map((item) => {
		const row: CompactAddBatchResult["rows"][number] = { ...item };
		for (const field of defaultFields) {
			if (row[field] === defaults[field]) delete row[field];
		}
		return row;
	});

	return { ...batch, defaults, rows };
};
