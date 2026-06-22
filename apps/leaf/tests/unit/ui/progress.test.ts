import { describe, expect, test } from "bun:test";
import {
	createActionLogger,
	createKeyedActionLogger,
	type ReplyTarget,
	startLoading,
} from "../../../src/ui/progress.js";

type LoadingMock = Parameters<typeof createActionLogger>[0];
type TargetMock = Parameters<typeof createActionLogger>[1];

describe("progress action logger", () => {
	test("uses neutral typing text for quiet follow-up loading", async () => {
		const typing: string[] = [];
		const target = {
			startTyping: async (message: string) => typing.push(message),
		};

		const loading = await startLoading(target as unknown as ReplyTarget, {
			showPlan: false,
		});

		expect(loading).toBeNull();
		expect(typing).toEqual(["Working on it..."]);
	});

	test("uses custom text for visible follow-up loading", async () => {
		const typing: string[] = [];
		const posts: unknown[] = [];
		const target = {
			post: async (message: unknown) => posts.push(message),
			startTyping: async (message: string) => typing.push(message),
		};

		const loading = await startLoading(target as unknown as ReplyTarget, {
			initialMessage: "Working on it...",
			showPlan: true,
		});

		expect(loading).not.toBeNull();
		expect(typing).toEqual(["Working on it..."]);
		expect(posts).toHaveLength(1);
	});

	test("renders batched tool actions in one visible loading plan", async () => {
		const resets: unknown[] = [];
		const tasks: unknown[] = [];
		const loading = {
			addTask: async (input: unknown) => tasks.push(input),
			reset: async (input: unknown) => resets.push(input),
		};
		const logAction = createActionLogger(loading as unknown as LoadingMock);

		await logAction("Listing plans");
		await logAction("Listing features");
		await logAction("Listing plans");

		expect(resets).toEqual([{ initialMessage: "Listing plans" }]);
		expect(tasks).toEqual([{ title: "Listing features" }]);
	});

	test("keyed events update one plan task in place with a repeat count", async () => {
		const tasks: unknown[] = [];
		const updates: unknown[] = [];
		const loading = {
			addTask: async (input: unknown) => {
				tasks.push(input);
				return { id: "task_1" };
			},
			updateTask: async (input: unknown) => updates.push(input),
		};
		const logKeyed = createKeyedActionLogger(loading as unknown as LoadingMock);

		await logKeyed({ key: "retry", message: "Preview failed — retrying" });
		await logKeyed({ key: "retry", message: "Preview failed — retrying" });
		await logKeyed({ key: "retry", message: "Preview failed — retrying" });

		expect(tasks).toEqual([{ title: "Preview failed — retrying" }]);
		expect(updates).toEqual([
			{ id: "task_1", output: "×2 · Preview failed — retrying" },
			{ id: "task_1", output: "×3 · Preview failed — retrying" },
		]);
	});

	test("uses neutral typing updates when there is no visible loading plan", async () => {
		const typing: string[] = [];
		const target = {
			startTyping: async (message: string) => typing.push(message),
		};
		const logAction = createActionLogger(null, target as unknown as TargetMock);

		await logAction("Listing plans");
		await logAction("Listing features");
		await logAction("Listing plans");

		expect(typing).toEqual(["Working on it...", "Working on it..."]);
	});
});
