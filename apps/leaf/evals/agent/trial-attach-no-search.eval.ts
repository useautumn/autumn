import { defineEval } from "eve/evals";

const customerLookups = (events: ReadonlyArray<{ type: string }>) =>
	events.flatMap((event) => {
		if (event.type !== "actions.requested") return [];
		const { data } = event as unknown as {
			data?: { actions?: Array<{ name?: string; toolName?: string }> };
		};
		return (data?.actions ?? [])
			.map((action) => action.toolName ?? action.name ?? "")
			.filter((name) => /listCustomers|searchCustomers/i.test(name));
	});

export default defineEval({
	description:
		"A trial attach for a customer named earlier in the thread reuses that id — no paging through the customer list to re-find them.",
	async test(t) {
		await t.send(
			"i'm looking at customer gen-attach-trial, can you tell me what plan they're on?",
		);
		const attach = await t.send(
			"can u attach scale with a 2 week free trial to this customer",
		);

		// Turn 2 names a billing action against the customer the thread already
		// identified, so it must reuse that id rather than re-find them.
		attach.calledTool("autumn__attach", { status: "pending" });
		attach.eventsSatisfy(
			"the customer is never re-found by listing customers",
			(events) => customerLookups(events).length === 0,
		);
	},
});
