import { describe, expect, mock, test } from "bun:test";
import type { Plan } from "chat";
import { createRunProgress } from "../../../src/ui/runProgress.js";

const createTarget = () => {
	const editObject = mock(async () => ({
		id: "M1",
		raw: {},
		threadId: "slack:C1:T1",
	}));
	const startTyping = mock(async () => {});
	const plans: Plan[] = [];
	const post = mock(async (plan: Plan) => {
		plans.push(plan);
		plan.onPosted({
			adapter: {
				editObject,
				postObject: mock(async () => ({
					id: "M1",
					raw: {},
					threadId: "slack:C1:T1",
				})),
			},
			messageId: "M1",
			threadId: "slack:C1:T1",
		} as never);
		return plan;
	});
	return {
		editObject,
		plans,
		post,
		startTyping,
		target: { post, startTyping } as never,
	};
};

describe("createRunProgress", () => {
	test("posts and completes a native plan", async () => {
		const { plans, post, target } = createTarget();
		const progress = createRunProgress({
			showPlan: true,
			target,
			text: "  @U0B66PD6MKQ   list   my plans  ",
		});

		await progress.start();
		await progress.activity("Loading context");
		await progress.activity("Looking through your plans");
		await progress.activity("Loading context");
		await progress.complete();

		expect(post).toHaveBeenCalledTimes(1);
		expect(plans[0].getPostData()).toEqual({
			title: "list my plans",
			tasks: [
				expect.objectContaining({
					status: "complete",
					title: "Preparing request",
				}),
				expect.objectContaining({
					status: "complete",
					title: "Loading context",
				}),
				expect.objectContaining({
					status: "complete",
					title: "Looking through your plans",
				}),
			],
		});
	});

	test("adds concise tool results without exposing payload details", async () => {
		const { plans, target } = createTarget();
		const progress = createRunProgress({
			showPlan: true,
			target,
			text: "attach pro",
		});

		await progress.start();
		await progress.activity({
			label: "Looking through your plans",
			phase: "started",
			toolName: "listPlans",
		});
		await progress.activity({
			label: "Looking through your plans",
			output: {
				list: [{ id: "internal_plan_1" }, { id: "internal_plan_2" }],
				next_cursor: "internal_cursor",
			},
			phase: "completed",
			status: "completed",
			toolName: "listPlans",
		});
		await progress.activity({
			label: "Previewing the attach",
			phase: "started",
			toolName: "autumn__previewAttach",
		});
		await progress.activity({
			label: "Previewing the attach",
			output: {
				content: [
					{
						text: JSON.stringify({
							currency: "usd",
							next_cycle: { total: 40 },
							redirect_to_checkout: true,
							total: 20,
						}),
					},
				],
			},
			phase: "completed",
			status: "completed",
			toolName: "autumn__previewAttach",
		});

		const tasks = plans[0].getPostData().tasks;
		expect(tasks).toContainEqual(
			expect.objectContaining({
				output: "2 plans loaded · More available",
				title: "Looking through your plans",
			}),
		);
		expect(tasks.at(-1)).toEqual(
			expect.objectContaining({
				output: "$20.00 due now · $40.00 next cycle · Checkout required",
				status: "complete",
				title: "Previewing the attach",
			}),
		);
	});

	test("marks the current task as failed", async () => {
		const { plans, target } = createTarget();
		const progress = createRunProgress({
			showPlan: true,
			target,
			text: "attach pro",
		});

		await progress.start();
		await progress.activity("Previewing the attach");
		await progress.fail("The preview failed");
		await progress.complete();

		const plan = plans[0].getPostData();
		expect(plan.title).toBe("attach pro");
		expect(plan.tasks.at(-1)).toEqual(
			expect.objectContaining({
				output: "The preview failed",
				status: "error",
			}),
		);
	});

	test("keeps follow-up turns status-only", async () => {
		const { post, startTyping, target } = createTarget();
		const progress = createRunProgress({
			showPlan: false,
			target,
			text: "continue",
		});

		progress.thinking();
		await progress.start();
		await progress.activity("Looking up the customer");
		await progress.complete();

		expect(post).not.toHaveBeenCalled();
		expect(startTyping).toHaveBeenCalled();
	});
});
