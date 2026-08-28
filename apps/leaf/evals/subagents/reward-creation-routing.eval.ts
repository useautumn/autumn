import { defineEval } from "eve/evals";

export default defineEval({
	description:
		"A reward-creation request routes to the billing subagent — not turned away as a dashboard-only catalog change — and billing raises the gated createReward write.",
	async test(t) {
		const turn = await t.send(
			"Create a 20% off coupon with promo code LAUNCH20 that applies to all plans, forever.",
		);
		t.event("subagent.called", { data: { name: "billing" } });
		t.notEvent("subagent.called", { data: { name: "investigator" } });
		turn.calledTool("autumn__createReward", { status: "pending" });
	},
});
