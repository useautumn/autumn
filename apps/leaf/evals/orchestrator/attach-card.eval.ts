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
