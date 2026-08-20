import { defineEval } from "eve/evals";

export default defineEval({
	description: "The agent boots, accepts a message, and replies.",
	async test(t) {
		await t.send("Reply with the single word ok. Do not use any tools.");
		t.succeeded();
	},
});
