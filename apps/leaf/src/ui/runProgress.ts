import { Plan } from "chat";
import type { AgentActionProgress } from "../internal/agentRuntime/domain/agentTurnContext.js";
import { actionProgressResult } from "./actionProgress.js";
import type { ReplyTarget } from "./progress.js";
import { createStatusTicker } from "./statusTicker.js";

const PLAN_TITLE_MAX_LENGTH = 80;
const MAX_PLAN_TASKS = 8;
const INITIAL_TASK = "Preparing request";

const planTitle = (text: string) => {
	const title = text
		.replace(/^\s*(?:<@[^>]+>|@[A-Z0-9]+)\s*/i, "")
		.replace(/\s+/g, " ")
		.trim();
	if (!title) return "Review attached files";
	return title.length > PLAN_TITLE_MAX_LENGTH
		? `${title.slice(0, PLAN_TITLE_MAX_LENGTH - 1).trimEnd()}…`
		: title;
};

export type RunProgress = Readonly<{
	activity: (progress: AgentActionProgress | string) => Promise<void>;
	complete: () => Promise<void>;
	fail: (detail?: string) => Promise<void>;
	start: () => Promise<void>;
	status: (message: string) => void;
	stop: () => void;
	thinking: () => void;
}>;

export const createRunProgress = ({
	showPlan,
	target,
	text,
}: {
	showPlan: boolean;
	target: ReplyTarget;
	text: string;
}): RunProgress => {
	const ticker = createStatusTicker(target);
	const plan = showPlan
		? new Plan({ initialMessage: INITIAL_TASK })
		: undefined;
	let planAvailable = Boolean(plan);
	let planStarted = false;
	let settled = false;
	let taskCount = plan ? 1 : 0;
	const seenActivities = new Map<string, string | undefined>([
		[INITIAL_TASK, undefined],
	]);

	const updatePlan = async (update: (current: Plan) => Promise<void>) => {
		if (!(plan && planAvailable && planStarted)) return;
		try {
			await update(plan);
		} catch (error) {
			planAvailable = false;
			console.warn("[chat] Could not update run plan", error);
		}
	};

	const settle = async ({
		detail,
		failed,
	}: {
		detail?: string;
		failed: boolean;
	}) => {
		if (settled) return;
		settled = true;
		ticker.stop();
		await updatePlan(async (current) => {
			if (failed) {
				await current.updateTask({ output: detail, status: "error" });
			}
			await current.complete({ completeMessage: planTitle(text) });
		});
	};

	const addActivity = async (label: string) => {
		const existingTaskId = seenActivities.get(label);
		if (seenActivities.has(label) || taskCount >= MAX_PLAN_TASKS) {
			return existingTaskId;
		}
		taskCount += 1;
		let taskId: string | undefined;
		await updatePlan(async (current) => {
			taskId = (await current.addTask({ title: label }))?.id;
		});
		seenActivities.set(label, taskId);
		return taskId;
	};

	return {
		activity: async (activity) => {
			if (settled) return;
			const label =
				typeof activity === "string" ? activity.trim() : activity.label.trim();
			if (!label) return;
			ticker.activity(label);
			if (typeof activity === "string" || activity.phase === "started") {
				await addActivity(label);
				return;
			}
			const taskId = await addActivity(label);
			if (!taskId) return;
			await updatePlan(async (current) => {
				await current.updateTask({
					id: taskId,
					...actionProgressResult(activity),
				});
			});
		},
		complete: () => settle({ failed: false }),
		fail: (detail) => settle({ detail, failed: true }),
		start: async () => {
			if (!(plan && planAvailable) || planStarted) return;
			try {
				await target.post(plan);
				planStarted = true;
			} catch (error) {
				planAvailable = false;
				console.warn("[chat] Could not post run plan", error);
			}
		},
		status: ticker.activity,
		stop: ticker.stop,
		thinking: ticker.thinking,
	};
};
