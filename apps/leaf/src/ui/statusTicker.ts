import { formatTypingStatus, type ReplyTarget } from "./progress.js";

// Generic "still working" verbs cycled during model inference, when there's no
// concrete tool action to show — a calm rotation like the dashboard's.
const THINKING_VERBS = [
	"Thinking",
	"Reasoning",
	"Analyzing",
	"Working on it",
	"Putting it together",
];

// Anti-flash pacing: a fast tool would otherwise blink its label for ~200ms
// between two "Thinking…" renders. Every status change holds long enough to
// read, and renders stay well under Slack's status rate limit.
const MIN_RENDER_INTERVAL_MS = 2500;
const ACTIVITY_HOLD_MS = 4000;
const VERB_CYCLE_MS = 5000;
const HEARTBEAT_MS = 500;

export type StatusTicker = {
	/** Agent is mid-inference with nothing concrete to show — cycle generic verbs. */
	thinking: () => void;
	/** A tool/action ran — pin its label until the next inference settles. */
	activity: (message: string) => void;
	/** Tear down the interval; further updates are ignored. */
	stop: () => void;
};

export const createStatusTicker = (target: ReplyTarget): StatusTicker => {
	let stopped = false;
	let timer: ReturnType<typeof setInterval> | null = null;
	let mode: "activity" | "idle" | "thinking" = "idle";
	let desired = "";
	let lastActivityAt = 0;
	let lastRenderAt = 0;
	let lastRendered = "";
	let lastVerbAt = 0;
	let verbIndex = 0;

	const send = (text: string) => {
		if (stopped || text === lastRendered) return;
		lastRendered = text;
		lastRenderAt = Date.now();
		// formatTypingStatus enforces Slack's length cap; the empty-string clear
		// in stop() stays raw because the formatter swaps "" for a default label.
		target.startTyping(formatTypingStatus(text)).catch((error) => {
			console.warn("[chat] Could not update status", error);
		});
	};

	// One slow loop instead of eager renders: changes wait out the minimum
	// interval, so rapid activity→thinking→activity flips never flash.
	const tick = () => {
		if (stopped) return;
		const now = Date.now();
		if (
			mode === "thinking" &&
			now - lastActivityAt >= ACTIVITY_HOLD_MS &&
			now - lastVerbAt >= VERB_CYCLE_MS
		) {
			desired = `${THINKING_VERBS[verbIndex % THINKING_VERBS.length]}…`;
			verbIndex += 1;
			lastVerbAt = now;
		}
		if (
			desired &&
			desired !== lastRendered &&
			now - lastRenderAt >= MIN_RENDER_INTERVAL_MS
		) {
			send(desired);
		}
	};

	const ensureLoop = () => {
		if (timer || stopped) return;
		timer = setInterval(tick, HEARTBEAT_MS);
	};

	return {
		thinking: () => {
			if (stopped) return;
			mode = "thinking";
			ensureLoop();
			// First signal renders immediately so the thread never sits silent.
			if (!lastRendered) {
				desired = `${THINKING_VERBS[0]}…`;
				verbIndex = 1;
				lastVerbAt = Date.now();
				send(desired);
			}
		},
		activity: (message: string) => {
			if (stopped) return;
			mode = "activity";
			lastActivityAt = Date.now();
			desired = `${message}…`;
			ensureLoop();
			// Concrete work renders eagerly (respecting the minimum interval via
			// the loop); the first one always lands immediately.
			if (Date.now() - lastRenderAt >= MIN_RENDER_INTERVAL_MS) {
				send(desired);
			}
		},
		stop: () => {
			if (stopped) return;
			stopped = true;
			if (timer) {
				clearInterval(timer);
				timer = null;
			}
		},
	};
};
