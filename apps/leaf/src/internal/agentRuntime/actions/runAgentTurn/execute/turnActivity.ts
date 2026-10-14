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
