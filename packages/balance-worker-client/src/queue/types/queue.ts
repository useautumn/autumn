import type {
	EvictCommand,
	FinalizeCommand,
	ResetCommand,
	TrackCommand,
	UpdateBalanceCommand,
} from "@autumn/balance-engine";
import type { CommandPublisher, CommandRecord } from "@autumn/kafka";

export type CommandLog = Pick<CommandPublisher, "append">;

export type QueueContext = {
	commandLog?: CommandLog;
	partitionCount: number;
	timeoutMs: number;
};

export type EnqueueParams = {
	commands: readonly CommandRecord[];
	signal?: AbortSignal;
};

export type CommandQueue = {
	track(params: {
		commands: readonly TrackCommand[];
		signal?: AbortSignal;
	}): Promise<void>;
	reset(params: {
		commands: readonly ResetCommand[];
		signal?: AbortSignal;
	}): Promise<void>;
	updateBalance(params: {
		commands: readonly UpdateBalanceCommand[];
		signal?: AbortSignal;
	}): Promise<void>;
	evict(params: {
		commands: readonly EvictCommand[];
		signal?: AbortSignal;
	}): Promise<void>;
	finalize(params: {
		commands: readonly FinalizeCommand[];
		signal?: AbortSignal;
	}): Promise<void>;
};
