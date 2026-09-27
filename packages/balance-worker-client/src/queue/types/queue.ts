import type {
	EvictCommand,
	ResetCommand,
	TrackCommand,
	UpdateBalanceCommand,
} from "@autumn/balance-engine";
import type { CommandPublisher, CommandRecord } from "@autumn/kafka";

/** Where queued commands go; the owner of each partition consumes them later. */
export type CommandLog = Pick<CommandPublisher, "append">;

export type QueueContext = {
	commandLog?: CommandLog;
	partitionCount: number;
	/** The client's append budget (`appendTimeoutMs`). */
	timeoutMs: number;
};

export type EnqueueParams = {
	commands: readonly CommandRecord[];
	signal?: AbortSignal;
};

/** Queued for the partition owners; nobody waits for a reply. */
export type CommandQueue = {
	track(params: {
		commands: readonly TrackCommand[];
		signal?: AbortSignal;
	}): Promise<void>;
	reset(params: {
		commands: readonly ResetCommand[];
		signal?: AbortSignal;
	}): Promise<void>;
	/** `balances.update` on the async path: the owner decides it in log order. */
	updateBalance(params: {
		commands: readonly UpdateBalanceCommand[];
		signal?: AbortSignal;
	}): Promise<void>;
	/** Batch writers' evict: the owner drops each customer's copy in log order, after the store has its earlier writes. */
	evict(params: {
		commands: readonly EvictCommand[];
		signal?: AbortSignal;
	}): Promise<void>;
};
