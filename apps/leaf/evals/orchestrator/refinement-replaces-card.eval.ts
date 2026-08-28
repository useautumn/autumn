import { defineEval } from "eve/evals";

export default defineEval({
	description:
		"A pending-proposal question stays text-only, then a concrete refinement issues the changed terms.",
	async test(t) {
		const initial = await t.send(
			"Attach pro_gen-attach-multi to customer gen-attach-multi at $1,035 per month. Do not ask for confirmation; show the preview.",
		);
		initial.calledTool("autumn__attach", { status: "pending" });

		const question = await t.send(
			"Before I approve it, explain what the customer would pay. Do not change the proposal.",
			{ turnPolicy: "steer" },
		);
		question.event("subagent.called", { data: { name: "billing" } });
		question.notCalledTool("autumn__attach");
		question.event("message.completed");

		const replacement = await t.send(
			"Actually add a 14-day free trial to that proposal and keep everything else unchanged.",
			{ turnPolicy: "steer" },
		);

		replacement.calledTool("autumn__attach", { status: "pending" });
		replacement.eventsSatisfy(
			"the delegation identifies the replacement and its delta",
			(events) =>
				events.some((event) => {
					if (event.type !== "actions.requested") return false;
					const actions = (
						event as unknown as {
							data?: { actions?: Array<{ input?: { message?: string } }> };
						}
					).data?.actions;
					return (actions ?? []).some(({ input }) => {
						const message = input?.message ?? "";
						return (
							/replacement of pending proposal/i.test(message) &&
							/changed:[^\n]*14[^\n]*trial/i.test(message)
						);
					});
				}),
		);
		replacement.eventsSatisfy(
			"the replacement carries the trial and summarizes its payment outcome",
			(events) =>
				events.some((event) => {
					if (event.type !== "input.requested") return false;
					const input = (
						event as unknown as {
							data: {
								requests?: Array<{
									action?: { input?: Record<string, unknown> };
								}>;
							};
						}
					).data.requests?.[0]?.action?.input;
					const request = input?.request as
						| {
								customize?: { price?: { amount?: number } };
								free_trial?: { duration_length?: number };
						  }
						| undefined;
					const summary = input?.approval_summary;
					return (
						request?.customize?.price?.amount === 1035 &&
						request.free_trial?.duration_length === 14 &&
						typeof summary === "string" &&
						/^\s*(updated|added)/i.test(summary) &&
						/14[^.]*trial/i.test(summary) &&
						/1035|1,035/.test(summary) &&
						/invoice|charg/i.test(summary) &&
						/(?:\d{4}-\d{2}-\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/i.test(
							summary,
						) &&
						!/invoice[ -]?mode/i.test(summary)
					);
				}),
		);
	},
});
