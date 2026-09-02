import { defineEval } from "eve/evals";

const attachRequests = (events: ReadonlyArray<{ type: string }>) =>
	events.flatMap((event) => {
		if (event.type !== "input.requested") return [];
		const { data } = event as unknown as {
			data?: {
				requests?: Array<{
					action?: { input?: Record<string, unknown>; toolName?: string };
				}>;
			};
		};
		return (data?.requests ?? [])
			.filter((request) => request.action?.toolName?.includes("attach"))
			.map((request) => request.action?.input?.request);
	});

export default defineEval({
	description:
		"Terms from the original billing request (a 14-day trial) survive a clarify-then-confirm follow-up into the write that is finally issued.",
	async test(t) {
		await t.send(
			"i closed a deal with customer_id: 2094584-eval. please put them on a growth plan trial for 14 days.",
		);
		const confirm = await t.send("create it");

		confirm.calledTool("autumn__attach", { status: "pending" });
		confirm.eventsSatisfy(
			"the confirmed write still carries the 14-day trial",
			(events) => {
				const request = attachRequests(events).at(-1) as
					| { free_trial?: { duration_length?: number } }
					| undefined;
				return request?.free_trial?.duration_length === 14;
			},
		);
	},
});
