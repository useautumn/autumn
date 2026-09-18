import { isDeepStrictEqual } from "node:util";
import { defineEval } from "eve/evals";

export default defineEval({
	description:
		"An unchanged follow-up retains the original 14-day trial approval without duplicating its gate or executing the write.",
	async test(t) {
		const initial = await t.send(
			"i closed a deal with customer_id: 2094584-eval. please put them on a growth plan trial for 14 days.",
		);
		initial.calledTool("autumn__attach", { status: "pending", count: 1 });
		const pending = structuredClone(
			t.requireInputRequest({ toolName: "autumn__attach" }),
		);
		initial.eventsSatisfy("the original trial terms are preserved", () => {
			const request = pending.action.input.request as
				| {
						customer_id?: string;
						plan_id?: string;
						free_trial?: { duration_length?: number; duration_type?: string };
				  }
				| undefined;
			return (
				request?.customer_id === "2094584-eval" &&
				request.plan_id === "growth" &&
				request.free_trial?.duration_length === 14 &&
				request.free_trial.duration_type === "day"
			);
		});
		await t.send("create it");
		t.calledTool("autumn__attach", { status: "pending", count: 1 });
		t.eventsSatisfy(
			"the same unchanged approval remains unresolved",
			(events) => {
				const requests = events.flatMap((event) =>
					event.type === "input.requested"
						? event.data.requests.filter(
								(request) => request.action.toolName === "autumn__attach",
							)
						: [],
				);
				return (
					requests.length > 0 &&
					requests.every(
						(request) =>
							request.requestId === pending.requestId &&
							request.action.callId === pending.action.callId &&
							isDeepStrictEqual(request.action.input, pending.action.input),
					) &&
					events.every(
						(event) =>
							event.type !== "input.resolved" ||
							event.data.resolutions.every(
								(resolution) => resolution.requestId !== pending.requestId,
							),
					)
				);
			},
		);
		t.eventsSatisfy("the attach never executes", (events) =>
			events.every(
				(event) =>
					event.type !== "action.result" ||
					event.data.result.kind !== "tool-result" ||
					event.data.result.toolName !== "autumn__attach" ||
					event.data.status !== "completed",
			),
		);
	},
});
