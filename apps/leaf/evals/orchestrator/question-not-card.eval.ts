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
		"A question asked while a write is pending is answered in text — the withdrawn card is not rebuilt in place of the answer (prod thread C0BCAQQK0KS, 2026-08-25).",
	async test(t) {
		await t.send(
			"put customer gen-attach-multi on pro_gen-attach-multi, 1035 per month",
		);
		const question = await t.send("how many emails will they have after?");

		question.eventsSatisfy(
			"the question is answered, not re-carded",
			(events) => attachCards(events) === 0,
		);
		question.eventsSatisfy("the turn replies in text", (events) =>
			events.some((event) => event.type === "message.completed"),
		);
	},
});
