/** A turn is alive while ANY of its sessions is producing events: work
 * delegated to a subagent runs on the child's stream, so the parent can be
 * legitimately quiet for minutes. Both streams report here, and the idle
 * decision reads this clock rather than one socket's silence. */
export type TurnActivity = {
	activeChildren: () => number;
	childFinished: () => void;
	childStarted: () => void;
	msSinceActivity: () => number;
	msSinceStart: () => number;
	touch: () => void;
};

export const createTurnActivity = (): TurnActivity => {
	const startedAt = Date.now();
	let lastActivityAt = startedAt;
	let children = 0;
	return {
		activeChildren: () => children,
		childFinished: () => {
			children = Math.max(0, children - 1);
			lastActivityAt = Date.now();
		},
		childStarted: () => {
			children += 1;
			lastActivityAt = Date.now();
		},
		msSinceActivity: () => Date.now() - lastActivityAt,
		msSinceStart: () => Date.now() - startedAt,
		touch: () => {
			lastActivityAt = Date.now();
		},
	};
};
