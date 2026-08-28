import { defineEval } from "eve/evals";

const attachCards = (events: ReadonlyArray<{ type: string }>) =>
	events.filter((event) => {
		if (event.type !== "input.requested") return false;
		const { requests } = event as unknown as {
			requests?: Array<{ action?: { toolName?: string } }>;
		};
		return (requests ?? []).some((request) =>
			request.action?.toolName?.includes("attach"),
		);
	}).length;

export default defineEval({
	description:
		"An objection asking for an explanation while a write is pending gets text — no billing re-delegation or rebuilt card (prod thread C0BCAQQK0KS).",
	async test(t) {
		await t.send(
			"put customer gen-attach-multi on pro_gen-attach-multi, 1035 per month",
		);
		const question = await t.send(
			"STOP previewing attach. tell me why you did that",
		);

		question.notEvent("subagent.called", { data: { name: "billing" } });
		question.eventsSatisfy(
			"the question is answered, not re-carded",
			(events) => attachCards(events) === 0,
		);
		question.eventsSatisfy("the turn replies in text", (events) =>
			events.some((event) => event.type === "message.completed"),
		);
	},
});
