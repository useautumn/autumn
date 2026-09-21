import type { z } from "zod/v4";
import type { AddBatchResultSchema } from "../../../actions/addCustomerEntitlementsForPage/types/addBatchResult.js";
import type { CompactAddBatchResult } from "./types/compactAddBatchResult.js";

export const compactToAddBatchResult = ({
	result,
}: {
	result: CompactAddBatchResult;
}): z.infer<typeof AddBatchResultSchema> => {
	const { defaults, rows } = result;

	return {
		candidates: result.candidates,
		excludedInternalCustomerIds: result.excludedInternalCustomerIds,
		insertedItems:
			defaults === null ? [] : rows.map((row) => ({ ...defaults, ...row })),
	};
};
