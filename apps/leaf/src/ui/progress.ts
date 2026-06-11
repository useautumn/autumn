import type { Channel, Thread } from "chat";
import { Plan } from "chat";

export type ReplyTarget = Thread | Channel;
export type LoadingState = Plan | null;

// Posting the Plan notifies the user; follow-up turns skip it and rely on the
// notification-free typing status line instead.
export const startLoading = async (
	target: ReplyTarget,
	{ showPlan = true }: { showPlan?: boolean } = {},
) => {
	try {
		await target.startTyping("Starting Autumn...");
		if (!showPlan) return null;
		const loading = new Plan({ initialMessage: "Starting Autumn..." });
		await target.post(loading);
		return loading;
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
				await target?.startTyping(message);
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
