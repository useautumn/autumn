import type { DrizzleCli } from "@/db/initDrizzle.js";
import { withStatementTimeout } from "@/db/withStatementTimeout";
import type { BatchMutationResult } from "../types/types";
import {
	BATCH_TRANSITION_ROW_BATCH_SIZE,
	BATCH_TRANSITION_STATEMENT_TIMEOUT_MS,
	MAX_BATCH_TRANSITION_BATCHES,
	MAX_BATCH_TRANSITION_ROWS_PER_OPERATION,
} from "../utils/batchTransitionConstants";

export const executeBatchedMutation = async ({
	db,
	operationName,
	executeBatch,
}: {
	db: DrizzleCli;
	operationName: string;
	executeBatch: (args: {
		db: DrizzleCli;
		batchSize: number;
	}) => Promise<BatchMutationResult>;
}): Promise<number> => {
	let totalAffected = 0;

	for (
		let batchNumber = 1;
		batchNumber <= MAX_BATCH_TRANSITION_BATCHES;
		batchNumber++
	) {
		const result = await withStatementTimeout(
			db,
			async (transaction) =>
				executeBatch({
					db: transaction,
					batchSize: BATCH_TRANSITION_ROW_BATCH_SIZE,
				}),
			BATCH_TRANSITION_STATEMENT_TIMEOUT_MS,
		);

		if (
			typeof result.hasMore !== "boolean" ||
			!Number.isInteger(result.affected) ||
			result.affected < 0 ||
			result.affected > BATCH_TRANSITION_ROW_BATCH_SIZE
		) {
			throw new Error(
				`${operationName} returned an invalid affected row count`,
			);
		}

		totalAffected += result.affected;
		if (!result.hasMore) return totalAffected;
		if (result.affected === 0) {
			throw new Error(`${operationName} made no progress`);
		}
	}

	throw new Error(
		`${operationName} exceeded the ${MAX_BATCH_TRANSITION_ROWS_PER_OPERATION} row safety limit`,
	);
};
