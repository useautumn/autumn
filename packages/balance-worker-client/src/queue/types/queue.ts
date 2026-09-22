import type {
	MutatingCommand,
	ResetCommand,
	TrackCommand,
} from "@autumn/balance-engine";
import type { CommandPublisher } from "@autumn/kafka";

/** Where queued commands go; the owner of each partition consumes them later. */
export type CommandLog = Pick<CommandPublisher, "append">;

export type QueueContext = {
	commandLog?: CommandLog;
	partitionCount: number;
};

export type EnqueueParams = { commands: readonly MutatingCommand[] };

/** Queued for the partition owners; nobody waits for a reply. */
export type CommandQueue = {
	track(params: { commands: readonly TrackCommand[] }): Promise<void>;
	reset(params: { commands: readonly ResetCommand[] }): Promise<void>;
};
