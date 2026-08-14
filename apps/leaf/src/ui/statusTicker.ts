import { ms } from "@autumn/shared";
import { differenceInMilliseconds } from "date-fns";
import { formatTypingStatus, type ReplyTarget } from "./progress.js";

const THINKING_VERBS = [
	"Thinking",
	"Reasoning",
	"Analyzing",
	"Working on it",
	"Putting it together",
];

// Prevent fast tools from flashing status labels while staying under Slack's
// status rate limit.
const MIN_RENDER_INTERVAL_MS = ms.seconds(2.5);
const ACTIVITY_HOLD_MS = ms.seconds(4);
const VERB_CYCLE_MS = ms.seconds(5);
const HEARTBEAT_MS = ms.seconds(0.5);

export type StatusTicker = {
	thinking: () => void;
	activity: (message: string) => void;
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

	const tick = () => {
		if (stopped) return;
		const now = Date.now();
		if (
			mode === "thinking" &&
			differenceInMilliseconds(now, lastActivityAt) >= ACTIVITY_HOLD_MS &&
			differenceInMilliseconds(now, lastVerbAt) >= VERB_CYCLE_MS
		) {
			desired = `${THINKING_VERBS[verbIndex % THINKING_VERBS.length]}…`;
			verbIndex += 1;
			lastVerbAt = now;
		}
		if (
			desired &&
			desired !== lastRendered &&
			differenceInMilliseconds(now, lastRenderAt) >= MIN_RENDER_INTERVAL_MS
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
			if (
				differenceInMilliseconds(Date.now(), lastRenderAt) >=
				MIN_RENDER_INTERVAL_MS
			) {
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
			// Explicitly clear the status: without this, a snippet rendered just
			// before stop() outlives the run as a stuck "thinking" line.
			if (lastRendered) {
				target.startTyping("").catch(() => {});
			}
		},
	};
};
