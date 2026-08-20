import { defineAgent } from "eve";
import { leafModel, leafReasoning } from "../../lib/model.js";

export default defineAgent({
	description:
		"Autumn billing specialist. Delegate every billing action here: attaching plans, updating subscriptions (quantities, cancels, custom terms), creating schedules, and balance grants. Pack the full task into the message — customer and plan ids, quantities, customize terms, timing, invoice settings, and any investigator findings.",
	model: leafModel("billing"),
	reasoning: leafReasoning,
});
