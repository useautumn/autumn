import { leafSkillsFor, skillToText } from "@autumn/agent-docs/agent";
import {
	type GenerateBillingTool,
	generationRegistry,
} from "../generationSchemas";

/** The billing subagent's full skill bundle (billing + concepts, with
 * references inlined) — the same single source Leaf runs on. */
const SHARED_PARAM_DOCS = leafSkillsFor("billing")
	.map(skillToText)
	.join("\n\n");

/** Stable per tool — with the varying context in the user message, this whole
 * block (plus the tool schema) is a cacheable prompt prefix. */
export const buildSystemPrompt = (tool: GenerateBillingTool) => {
	const rules = [
		`You convert a natural-language billing request into structured parameters for Autumn's ${tool} operation, in one shot.`,
		generationRegistry[tool].promptFragment,
		SHARED_PARAM_DOCS,
		"IMPORTANT — one-shot overrides. The docs above are written for an interactive agent; you are not one. These rules take precedence over anything above:",
		"- You cannot ask questions and have no tools. Wherever the docs say to ask, clarify, or call a tool, decide yourself from the most literal reading of the request and produce the single best complete request. Never emit a partial or empty object.",
		"- Never omit a required field. Always set plan_id to your best match from the context plans; when sibling variants exist (e.g. monthly vs yearly), pick the one matching the stated interval or amount, defaulting to the monthly variant.",
		"- When the request states a price for a plan (e.g. 'at 10k/mo'), always set customize.price to it — including Enterprise/custom placeholder plans where the docs say to ask about the base price.",
		"- Use ONLY plan ids and feature ids that appear in the context below.",
		"- Monetary amounts are in major currency units (e.g. dollars). Never convert to cents.",
		"- The operation always targets the customer in the context. Ignore any other customer mentioned in the request.",
		"- Compute timestamps yourself from `now` in the context (epoch milliseconds).",
		"- Your output schema is a subset of the full billing params: invoice mode, redirect/checkout params, and the approval flow are handled by the system. Omit anything the schema does not define.",
		"- Free trials must set both duration_length and duration_type explicitly (e.g. a 14 day trial is duration_length 14, duration_type 'day').",
		"- Set only the fields the request asks for; unset fields may be omitted or set to JSON null.",
	];

	return rules.join("\n");
};

export const buildUserPrompt = ({
	prompt,
	contextJson,
	currentRequest,
	repairNote,
}: {
	prompt: string;
	contextJson: string;
	currentRequest?: Record<string, unknown>;
	repairNote?: string;
}) => {
	const parts = [`<context>\n${contextJson}\n</context>`];

	if (currentRequest) {
		parts.push(
			"The user is editing this existing request. Preserve every field of it that the prompt does not mention, and change only what the prompt asks for. Its field names may use an older dialect — map them onto the schema's field names (product_id -> plan_id; options -> feature_quantities; a top-level free_trial or items belong under customize, with free_trial using duration_length/duration_type):",
			JSON.stringify(currentRequest),
		);
	}

	parts.push(prompt);
	if (repairNote) parts.push(repairNote);
	return parts.join("\n\n");
};
