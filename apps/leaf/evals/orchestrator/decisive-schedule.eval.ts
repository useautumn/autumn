import { defineEval } from "eve/evals";

export default defineEval({
	description:
		"An ambiguous billing ask (bare variant name, price ramp) delegates straight to billing with decisive defaults — no investigator hop and no clarifying question.",
	async test(t) {
		await t.send(
			"for customer exec-mt2unrns-b start a schedule on scale and 3x the price every year for 4 years",
		);
		t.event("subagent.called", { data: { name: "billing" } });
		t.notEvent("subagent.called", { data: { name: "investigator" } });
		// The eval harness has no Autumn auth, so billing cannot build and park
		// the real approval here; the guarded contract is that nobody converts
		// ambiguity into a question park (question parks carry no action).
		t.eventsSatisfy("never parks a clarifying question", (events) =>
			events.every(
				(event) =>
					event.type !== "input.requested" ||
					event.requests.every((request) => request.action !== undefined),
			),
		);
	},
});
