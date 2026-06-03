import type { Channel, Thread } from "chat";
import { Plan } from "chat";

export type ReplyTarget = Thread | Channel;
export type LoadingState = Plan | null;

export const startLoading = async (target: ReplyTarget) => {
	try {
		await target.startTyping("Starting Autumn...");
		const loading = new Plan({ initialMessage: "Starting Autumn..." });
		await target.post(loading);
		return loading;
	} catch (error) {
		console.warn("[chat] Could not show loading state", error);
		return null;
	}
};

export const createActionLogger = (loading: LoadingState) => {
	const seen = new Set<string>();
	let first = true;

	return async (message: string) => {
		if (!loading || seen.has(message)) return;
		seen.add(message);

		try {
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
	if (!loading) {
		await target.post({ markdown: message });
		return;
	}

	try {
		await loading.complete({ completeMessage: message });
	} catch (error) {
		console.warn("[chat] Could not complete loading state", error);
		await target.post({ markdown: message });
	}
};
