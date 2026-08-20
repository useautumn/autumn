import { defineEval } from "eve/evals";

export default defineEval({
	description:
		"A customer listing delegates to the investigator — the orchestrator has no customer tools and must never claim a listing tool is missing.",
	async test(t) {
		await t.send("list our customers");
		t.succeeded();
		t.calledSubagent("investigator");
	},
});
