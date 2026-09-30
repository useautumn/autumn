export type WorkerIdleStatus = {
	activeWorkCount: number;
	idleForMs: number;
	shouldRecycle: boolean;
	totalMessagesReceived: number;
};

export const createWorkerActivityTracker = ({
	idleAfterMs,
	now = Date.now,
}: {
	idleAfterMs: number;
	now?: () => number;
}) => {
	let activeWorkCount = 0;
	let lastMessageReceivedAt: number | null = null;
	let lastPollCompletedAt: number | null = null;
	let totalMessagesReceived = 0;

	const recordMessagesReceived = ({ count }: { count: number }) => {
		if (count <= 0) return;
		lastMessageReceivedAt = now();
		lastPollCompletedAt = lastMessageReceivedAt;
		totalMessagesReceived += count;
	};

	const recordPollCompleted = () => {
		lastPollCompletedAt = now();
	};

	const startWork = () => {
		activeWorkCount++;
	};

	const finishWork = () => {
		activeWorkCount = Math.max(0, activeWorkCount - 1);
	};

	const getIdleStatus = (): WorkerIdleStatus => {
		const idleForMs =
			lastMessageReceivedAt === null
				? 0
				: Math.max(0, now() - lastMessageReceivedAt);
		const sinceLastPollMs =
			lastPollCompletedAt === null
				? idleForMs
				: Math.max(0, now() - lastPollCompletedAt);

		return {
			activeWorkCount,
			idleForMs,
			shouldRecycle:
				lastMessageReceivedAt !== null &&
				activeWorkCount === 0 &&
				idleForMs >= idleAfterMs &&
				sinceLastPollMs >= idleAfterMs,
			totalMessagesReceived,
		};
	};

	return {
		finishWork,
		getIdleStatus,
		recordMessagesReceived,
		recordPollCompleted,
		startWork,
	};
};

export type WorkerActivityTracker = ReturnType<
	typeof createWorkerActivityTracker
>;
