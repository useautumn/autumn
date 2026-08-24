import type { QueuedCommand } from "./queuedCommand.js";

export type CommandQueue = {
	push: (item: QueuedCommand) => void;
	take: () => Promise<QueuedCommand[]>;
	requeue: (deferred: QueuedCommand[]) => void;
	close: () => void;
};
