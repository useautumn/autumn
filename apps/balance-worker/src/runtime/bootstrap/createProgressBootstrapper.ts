import type { CommitterStateStore } from "../../committer/types/committer.js";
import { PartitionBootstrapRefusedError } from "./partitionBootstrapErrors.js";
import { assertPartitionLogRange } from "./plan/planPartitionBootstrap.js";
import type {
	PartitionBootstrapInput,
	PartitionBootstrapper,
	PartitionBootstrapResult,
} from "./types/partitionBootstrap.js";

/**
 * Postgres holds the bookmark, so there is nothing to restore: read it, or start at the log end
 * when there is none (earlier records belong to another backend).
 */
export function createProgressBootstrapper({
	stateStore,
}: {
	stateStore: Pick<
		CommitterStateStore,
		"loadProgress" | "readNextOffset" | "initializePartition"
	>;
}): PartitionBootstrapper {
	async function bootstrap({
		topic,
		partition,
		logRange,
		signal,
	}: PartitionBootstrapInput): Promise<PartitionBootstrapResult> {
		assertPartitionLogRange(logRange);
		signal.throwIfAborted();
		await stateStore.loadProgress({ topic, partition });
		signal.throwIfAborted();
		const nextOffset = stateStore.readNextOffset({ topic, partition });
		if (nextOffset === null) {
			await stateStore.initializePartition({
				topic,
				partition,
				nextOffset: logRange.logEndOffset,
			});
			return { kind: "initialized", nextOffset: logRange.logEndOffset };
		}
		if (nextOffset > logRange.logEndOffset) {
			throw new PartitionBootstrapRefusedError({
				topic,
				partition,
				reason: "local_state_ahead_of_log_end",
			});
		}
		if (nextOffset < logRange.logStartOffset) {
			throw new PartitionBootstrapRefusedError({
				topic,
				partition,
				reason: "progress_behind_log_start",
			});
		}
		return { kind: "continued", nextOffset };
	}
	return { bootstrap };
}
