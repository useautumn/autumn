import { formatTypingStatus, type ReplyTarget } from "./progress.js";

// Generic "still working" verbs cycled during model inference, when there's no
// concrete tool action to show. Slack renders its own shimmer; we just keep the
// text changing so the wait feels alive.
const THINKING_VERBS = [
	"Thinking",
	"Analyzing",
	"Reasoning",
	"Pondering",
	"Computing",
	"Untangling",
	"Synthesizing",
	"Discombobulating",
	"Ruminating",
	"Crunching",
];

// Slow enough to stay well under Slack's status rate limit, fast enough to read
// as motion.
const VERB_CYCLE_MS = 6000;

export type StatusTicker = {
	/** Agent is mid-inference with nothing concrete to show — cycle generic verbs. */
	thinking: () => void;
	/** A tool/action ran — pin its label until the next inference. */
	activity: (message: string) => void;
	/** Tear down the interval; further updates are ignored. */
	stop: () => void;
};

export const createStatusTicker = (target: ReplyTarget): StatusTicker => {
	let timer: ReturnType<typeof setInterval> | null = null;
	let verbIndex = 0;
	let stopped = false;
	let current = "";

	const render = (text: string) => {
		if (stopped || text === current) return;
		current = text;
		target.startTyping(formatTypingStatus(text)).catch((error) => {
			console.warn("[chat] Could not update status", error);
		});
	};

	const stopCycling = () => {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
	};

	const startCycling = () => {
		if (timer || stopped) return;
		timer = setInterval(() => {
			verbIndex = (verbIndex + 1) % THINKING_VERBS.length;
			render(`${THINKING_VERBS[verbIndex]}…`);
		}, VERB_CYCLE_MS);
	};

	return {
		thinking: () => {
			render(`${THINKING_VERBS[verbIndex]}…`);
			startCycling();
		},
		activity: (message: string) => {
			stopCycling();
			render(`${message}…`);
		},
		stop: () => {
			stopped = true;
			stopCycling();
		},
	};
};
