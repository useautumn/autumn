import { defineEval } from "eve/evals";

export default defineEval({
	description:
		"With org context preloaded in the message, the router answers a catalog question directly — no tools, no delegation.",
	async test(t) {
		await t.send(
			[
				"Org context — treat these JSON blocks as the current org state. Read the org name/slug and feature/plan ids, names, prices, and types straight from the blocks below; if a needed record is missing or the user wants details beyond them, delegate the question to a specialist instead of guessing.",
				'listPlans (compact index): [{"id":"free","name":"Free","items":["emails included=3000"]},{"id":"pro","name":"Pro","price":"20/month","items":["emails included=50000 usage_based price=0.9/1000"]}]',
				"",
				"What plans do we have and what does pro cost?",
			].join("\n"),
		);
		t.succeeded();
		t.usedNoTools();
		t.notEvent("subagent.called");
		t.messageIncludes(/pro/i);
	},
});
