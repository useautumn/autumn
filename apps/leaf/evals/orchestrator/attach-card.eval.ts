import { defineEval } from "eve/evals";

export default defineEval({
	description:
		"A complete attach request raises its approval card without sending prose that asks the user to confirm the preview.",
	async test(t) {
		const turn = await t.send(
			"attach pro_gen-attach-multi to customer gen-attach-multi at 1035 per month",
		);

		turn.calledTool("autumn__attach", { status: "pending" });
		turn.eventsSatisfy(
			"the write carries a grounded post-card summary",
			(events) =>
				events.some((event) => {
					if (event.type !== "input.requested") return false;
					const requests = (
						event as unknown as {
							data: {
								requests?: Array<{
									action?: { input?: Record<string, unknown> };
								}>;
							};
						}
					).data.requests;
					const summary = requests?.[0]?.action?.input?.approval_summary;
					return (
						typeof summary === "string" &&
						/1035|1,035/.test(summary) &&
						/custom|base price|override/i.test(summary) &&
						!/confirm|approve|looks good|shall I/i.test(summary)
					);
				}),
		);
		turn.eventsSatisfy(
			"the action turn emits no confirmation prose",
			(events) =>
				events.every(
					(event) =>
						event.type !== "message.completed" ||
						event.data.message.trim().length === 0,
				),
		);
	},
});
