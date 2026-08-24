import type { CommandQueue } from "./types/commandQueue.js";
import type { QueuedCommand } from "./types/queuedCommand.js";

export const createCommandQueue = (): CommandQueue => {
	const items: QueuedCommand[] = [];
	let closed = false;
	let wake: (() => void) | null = null;

	const wakeTaker = () => {
		const pending = wake;
		wake = null;
		pending?.();
	};

	const push = (item: QueuedCommand) => {
		items.push(item);
		wakeTaker();
	};

	// Drains everything queued so far: one slice is whatever arrived during
	// the previous append. Resolves empty only once closed and drained.
	const take = async (): Promise<QueuedCommand[]> => {
		while (items.length === 0 && !closed) {
			await new Promise<void>((resolve) => {
				wake = resolve;
			});
		}
		return items.splice(0);
	};

	const requeue = (deferred: QueuedCommand[]) => {
		items.unshift(...deferred);
	};

	const close = () => {
		closed = true;
		wakeTaker();
	};

	return { push, take, requeue, close };
};
