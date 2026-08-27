import { defineEval } from "eve/evals";

export default defineEval({
	description:
		"A write whose target never resolves is never issued: the specialist reads the customer first, and a ghost id gets a not-found reply — not a doomed approval card.",
	async test(t) {
		await t.send(
			"update customer helloworld in stripe: set their name, email, and metadata to anakin skywalker from star wars, and change their id to anakin_skywalker",
		);

		// A ghost id means no write at all — the reply reports the miss instead
		// of parking an approval. The child's ungated getCustomer read is not
		// visible on the parent stream, so the write gate carries the assertion:
		// an issued updateCustomer would park and surface here.
		t.event("subagent.called", { data: { name: "billing" } });
		t.notCalledTool("autumn__updateCustomer");
		t.messageIncludes(
			/not found|no customer|does ?n[o']?t exist|couldn'?t find|can'?t (?:verify|look up|confirm|find)/i,
		);
	},
});
