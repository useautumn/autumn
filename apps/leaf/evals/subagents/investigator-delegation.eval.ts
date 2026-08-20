import { defineEval } from "eve/evals";

export default defineEval({
	description:
		"The root delegates to the investigator subagent and folds its answer into the reply.",
	async test(t) {
		await t.send(
			"Delegate to the investigator subagent: have it reply with exactly the word VERIFIED and nothing else, using no tools. Then repeat its answer back to me.",
		);
		t.succeeded();
		t.calledSubagent("investigator");
		t.eventOrder([
			{ type: "subagent.called" },
			{ type: "subagent.completed" },
		]);
	},
});
