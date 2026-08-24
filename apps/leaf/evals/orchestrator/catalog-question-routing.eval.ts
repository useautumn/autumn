import { defineEval } from "eve/evals";

export default defineEval({
	description:
		"A catalog-detail question with no preloaded context routes to the investigator — never billing, and the router does not guess.",
	async test(t) {
		await t.send(
			"What are the usage tiers and overage rates on our enterprise plan?",
		);
		t.event("subagent.called", { data: { name: "investigator" } });
		t.notEvent("subagent.called", { data: { name: "billing" } });
	},
});
