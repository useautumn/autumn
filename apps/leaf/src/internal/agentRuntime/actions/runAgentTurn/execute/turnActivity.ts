/** A turn is alive while ANY of its sessions is producing events: work
 * delegated to a subagent runs on the child's stream, so the parent can be
 * legitimately quiet for minutes. Both streams report here, and the idle
 * decision reads this clock rather than one socket's silence. */
export type TurnActivity = {
	activeChildren: () => number;
	childFinished: () => void;
	childStarted: () => void;
	msSinceActivity: () => number;
	touch: () => void;
};

export const createTurnActivity = (): TurnActivity => {
	let lastActivityAt = Date.now();
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
		touch: () => {
			lastActivityAt = Date.now();
		},
	};
};
