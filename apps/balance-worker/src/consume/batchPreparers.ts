import type { IdempotencyKeyStore } from "@autumn/dynamodb";
import type { CommandRecord } from "@autumn/kafka";
import type { PartitionRuntimePort } from "../partitions/types/partitions.js";
import { prepareAtomFinalizeBatch } from "./consumeAtomFinalize.js";
import { prepareTrackBatch } from "./consumeTrack.js";

type PrepareParams = {
	commands: CommandRecord[];
	process: PartitionRuntimePort["process"];
	idempotencyKeys: IdempotencyKeyStore;
};

/** What a command type reads once per Kafka batch, before any of its records applies. */
const batchPreparers = {
	atomFinalize: prepareAtomFinalizeBatch,
	track: prepareTrackBatch,
} satisfies Partial<
	Record<CommandRecord["type"], (params: PrepareParams) => Promise<unknown>>
>;

/** Each command type's preparation for this batch, keyed by type. */
export type PreparedBatch = {
	[Type in keyof typeof batchPreparers]: Awaited<
		ReturnType<(typeof batchPreparers)[Type]>
	>;
};

export const prepareCommandBatch = async (
	params: PrepareParams,
): Promise<PreparedBatch> => {
	const entries = await Promise.all(
		Object.entries(batchPreparers).map(
			async ([type, prepare]) => [type, await prepare(params)] as const,
		),
	);
	return Object.fromEntries(entries) as PreparedBatch;
};
