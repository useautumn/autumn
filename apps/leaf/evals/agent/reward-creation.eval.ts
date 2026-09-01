import { defineEval } from "eve/evals";

export default defineEval({
	description:
		"A reward-creation request raises the gated createReward write — not turned away as a dashboard-only catalog change.",
	async test(t) {
		const turn = await t.send(
			"Create a 20% off coupon with promo code LAUNCH20 that applies to all plans, forever.",
		);
		turn.calledTool("autumn__createReward", { status: "pending" });
	},
});
