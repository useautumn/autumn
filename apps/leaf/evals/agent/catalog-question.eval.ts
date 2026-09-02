import { defineEval } from "eve/evals";

export default defineEval({
	description:
		"A catalog-detail question beyond the preloaded blocks is looked up with getPlan and answered — never guessed, and never turned into a write.",
	async test(t) {
		await t.send(
			"What are the usage tiers and overage rates on our enterprise plan?",
		);
		t.calledTool("autumn__getPlan");
		t.notCalledTool("autumn__attach");
		t.notCalledTool("autumn__updateSubscription");
	},
});
