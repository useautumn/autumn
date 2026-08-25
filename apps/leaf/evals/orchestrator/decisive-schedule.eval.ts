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
		// Ambiguity must never become a question park. An approval park is
		// fine — its requests carry an action; a question park does not.
		t.eventsSatisfy("never parks a clarifying question", (events) =>
			events.every(
				(event) =>
					event.type !== "input.requested" ||
					(event.data.requests ?? []).every(
						(request) => request.action !== undefined,
					),
			),
		);
	},
});
