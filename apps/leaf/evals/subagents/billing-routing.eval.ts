import { defineEval } from "eve/evals";

export default defineEval({
	description:
		"A fully-specified billing action routes straight to the billing subagent — no investigator pre-hop for state the billing subagent reads itself.",
	async test(t) {
		await t.send(
			"Customer acme-corp is currently on the scale plan and wants to upgrade to the enterprise plan at $1,750/month with 5M emails included and $0.35 per 1,000 after that. Set that up for me.",
		);
		// Routing only: the billing call may still be parked on an approval when
		// the turn ends, so assert the delegation event rather than completion.
		t.event("subagent.called", { data: { name: "billing" } });
		t.notEvent("subagent.called", { data: { name: "investigator" } });
	},
});
