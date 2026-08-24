import { defineEval } from "eve/evals";

const delegationMessages = (events: ReadonlyArray<{ type: string }>) =>
	events.flatMap((event) => {
		if (event.type !== "actions.requested") return [];
		const { data } = event as unknown as {
			data?: {
				actions?: Array<{ input?: { message?: string }; name?: string }>;
			};
		};
		return (data?.actions ?? [])
			.filter((action) => action.name === "billing")
			.map((action) => action.input?.message ?? "");
	});

export default defineEval({
	description:
		"Terms from the original billing request (a 14-day trial) survive a clarify-then-confirm follow-up into the re-delegation.",
	async test(t) {
		await t.send(
			"i closed a deal with customer_id: 2094584-eval. please put them on a growth plan trial for 14 days.",
		);
		await t.send("create it");
		t.event("subagent.called", { data: { name: "billing" } });
		t.eventsSatisfy(
			"the follow-up delegation still carries the trial",
			(events) => {
				const latest = delegationMessages(events).at(-1) ?? "";
				return /trial/i.test(latest) && /14/.test(latest);
			},
		);
	},
});
