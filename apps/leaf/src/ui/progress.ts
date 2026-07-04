import type { Channel, Thread } from "chat";
import { Plan } from "chat";

export type ReplyTarget = Thread | Channel;
export type LoadingState = Plan | null;

export type KeyedActionLogger = (input: {
	key: string;
	message: string;
}) => Promise<void> | void;

const typingStatusMessage = "Working on it...";
const maxTypingStatusLength = 50;
const truncationSuffix = "...";

export const formatTypingStatus = (message: string) => {
	const trimmed = message.trim() || typingStatusMessage;
	if (trimmed.length <= maxTypingStatusLength) return trimmed;

	return `${trimmed
		.slice(0, maxTypingStatusLength - truncationSuffix.length)
		.trimEnd()}${truncationSuffix}`;
};

const postPlan = async ({
	initialMessage,
	target,
}: {
	initialMessage: string;
	target: ReplyTarget;
}) => {
	const loading = new Plan({ initialMessage });
	await target.post(loading);
	return loading;
};

// Posting the Plan notifies the user; follow-up turns skip it and rely on the
// notification-free typing status line instead.
export const startLoading = async (
	target: ReplyTarget,
	{
		initialMessage = "Starting Autumn...",
		showPlan = true,
	}: { initialMessage?: string; showPlan?: boolean } = {},
) => {
	try {
		await target.startTyping(
			formatTypingStatus(showPlan ? initialMessage : typingStatusMessage),
		);
		if (!showPlan) return null;
		return await postPlan({ initialMessage, target });
	} catch (error) {
		console.warn("[chat] Could not show loading state", error);
		return null;
	}
};

export const createActionLogger = (
	loading: LoadingState,
	target?: ReplyTarget,
) => {
	const seen = new Set<string>();
	let first = true;

	return async (message: string) => {
		if (seen.has(message)) return;
		seen.add(message);

		try {
			if (!loading) {
				await target?.startTyping(formatTypingStatus(typingStatusMessage));
				return;
			}
			if (first) {
				first = false;
				await loading.reset({ initialMessage: message });
				return;
			}
			await loading.addTask({ title: message });
		} catch (error) {
			console.warn("[chat] Could not update loading state", error);
		}
	};
};

// Repeated events (tool retries, waits) update one Plan task in place
// instead of spamming a new line per occurrence.
export const createKeyedActionLogger = (
	loading: LoadingState,
	target?: ReplyTarget,
): KeyedActionLogger => {
	const tasks = new Map<string, { count: number; taskId: string | null }>();

	return async ({ key, message }) => {
		try {
			if (!loading) {
				await target?.startTyping(formatTypingStatus(message));
				return;
			}
			const existing = tasks.get(key);
			if (!existing) {
				const task = await loading.addTask({ title: message });
				tasks.set(key, { count: 1, taskId: task?.id ?? null });
				return;
			}
			existing.count += 1;
			if (existing.taskId) {
				await loading.updateTask({
					id: existing.taskId,
					output: `×${existing.count} · ${message}`,
				});
			}
		} catch (error) {
			console.warn("[chat] Could not update loading state", error);
		}
	};
};

export const finishLoading = async (
	target: ReplyTarget,
	loading: LoadingState,
	message: string,
) => {
	if (!loading) return;

	try {
		await loading.complete({ completeMessage: message });
	} catch (error) {
		console.warn("[chat] Could not complete loading state", error);
		await target.post({ markdown: message });
	}
};
