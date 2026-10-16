/** A turn is alive while ANY of its sessions produces events — the idle
 * decision reads this shared clock, never one socket's silence. */
export type TurnActivity = {
	activeChildren: () => number;
	childFinished: () => void;
	childStarted: () => void;
	msSinceActivity: () => number;
	msSinceStart: () => number;
	sawActivity: () => boolean;
	touch: () => void;
};

export const createTurnActivity = (): TurnActivity => {
	const startedAt = Date.now();
	let lastActivityAt = startedAt;
	let children = 0;
	let touched = false;
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
		sawActivity: () => touched,
		touch: () => {
			touched = true;
			lastActivityAt = Date.now();
		},
	};
};
