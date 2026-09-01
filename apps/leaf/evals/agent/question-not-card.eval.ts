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
		"An objection asking for an explanation about proposed billing is answered in text without producing a card (prod thread C0BCAQQK0KS).",
	async test(t) {
		const question = await t.send(
			"The proposed attach for gen-attach-multi on pro_gen-attach-multi at 1035 per month looks wrong. Explain why it uses 1035 without changing anything.",
		);

		question.eventsSatisfy(
			"the question is answered, not re-carded",
			(events) => attachCards(events) === 0,
		);
		question.eventsSatisfy("the turn replies in text", (events) =>
			events.some((event) => event.type === "message.completed"),
		);
	},
});
