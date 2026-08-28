import { defineEval } from "eve/evals";

const WRITE_TOOLS = ["autumn__updateCustomer", "autumn__attach"];

const writeCalls = (toolCalls: ReadonlyArray<{ name: string }>) =>
	toolCalls.filter((call) => WRITE_TOOLS.includes(call.name));

export default defineEval({
	description:
		"Two writes asked for in one message are issued together in one batch and surfaced on a single approval — not split across turns, and neither write is silently dropped (autumn-rules.md: 'change their email and put them on Pro').",
	async test(t) {
		const turn = await t.send(
			"change gen-attach-multi's email to billing@gen-attach-multi.com and put them on pro_gen-attach-multi at 1035 per month",
		);

		// Asserted by name: a bare count would stay green if one write were
		// issued twice, and the turn-scoped gates below would hold vacuously
		// on an empty set. Gated writes park unresolved, so match "pending"
		// rather than calledTool's "completed" default.
		turn.calledTool("autumn__updateCustomer", { status: "pending" });
		turn.calledTool("autumn__attach", { status: "pending" });

		turn.eventsSatisfy("the writes share one turn index", () => {
			const writes = writeCalls(turn.toolCalls);
			return (
				writes.length === 2 &&
				new Set(writes.map((c) => c.turnIndex)).size === 1
			);
		});

		// One request, one approval card — the user should not have to approve
		// the same request twice.
		turn.eventsSatisfy(
			"exactly one approval is raised",
			(events) =>
				events.filter((event) => event.type === "input.requested").length === 1,
		);

		turn.eventsSatisfy(
			"every write carries the same complete summary",
			(events) => {
				const requested = events.find(
					(event) => event.type === "input.requested",
				) as
					| {
							data: {
								requests?: Array<{
									action?: { input?: Record<string, unknown> };
								}>;
							};
					  }
					| undefined;
				const summaries = (requested?.data.requests ?? []).map(
					(request) => request.action?.input?.approval_summary,
				);
				return (
					summaries.length === 2 &&
					summaries.every(
						(summary) =>
							typeof summary === "string" &&
							summary === summaries[0] &&
							/email/i.test(summary) &&
							/1035|1,035/.test(summary),
					)
				);
			},
		);
	},
});
