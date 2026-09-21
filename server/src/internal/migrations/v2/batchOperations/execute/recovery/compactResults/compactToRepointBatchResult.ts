import type { z } from "zod/v4";
import type { RepointBatchResultSchema } from "../../types/repointBatchResult.js";
import type { CompactRepointBatchResult } from "./types/compactRepointBatchResult.js";

export const compactToRepointBatchResult = ({
	result,
}: {
	result: CompactRepointBatchResult;
}): z.infer<typeof RepointBatchResultSchema> => {
	const { defaults, rows } = result;
	return {
		rows: defaults === null ? [] : rows.map((row) => ({ ...defaults, ...row })),
	};
};
