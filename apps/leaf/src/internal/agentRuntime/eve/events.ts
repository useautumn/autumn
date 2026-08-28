import { normalizeToolName, toolGerund } from "../tools/toolPolicy.js";
import type {
	EveAction,
	EveActionResult,
	EveInputRequest,
} from "./eveEventSchemas.js";

export const labelForAction = (action?: EveAction) =>
	action?.toolName ??
	action?.name ??
	action?.subagentName ??
	(action?.kind === "subagent-call" ? "agent" : "Eve tool");

export const labelForResult = (result?: EveActionResult) =>
	result?.toolName ??
	result?.name ??
	result?.subagentName ??
	(result?.kind === "subagent-result" ? "agent" : "Eve tool");

// Status-line phrasing: present-progressive so the line reads as live work
// ("Looking up the customer…"), matching Slack's AI-app status conventions.
export const displayEveToolLabel = (actionOrLabel: EveAction | string) => {
	const label =
		typeof actionOrLabel === "string"
			? actionOrLabel
			: labelForAction(actionOrLabel);
	const name = normalizeToolName(label);
	if (name === "load_skill" && typeof actionOrLabel !== "string") {
		const input =
			actionOrLabel.input && typeof actionOrLabel.input === "object"
				? (actionOrLabel.input as { skill?: unknown })
				: undefined;
		return typeof input?.skill === "string"
			? `Reading the ${input.skill.replace(/^autumn-/, "")} playbook`
			: "Reading a playbook";
	}
	return toolGerund(name);
};

export const isPreviewToolName = (toolName: string) =>
	/^preview/i.test(normalizeToolName(toolName));

export const APPROVE_OPTION_ID = "approve";
export const DENY_OPTION_ID = "deny";

export const approvalOptionIds = () => ({
	approve: APPROVE_OPTION_ID,
	deny: DENY_OPTION_ID,
});

export const textForInputRequests = (
	requests: ReadonlyArray<EveInputRequest>,
) =>
	requests
		.map((request) => {
			const options = request.options
				?.map((option) => option.label ?? option.id)
				.filter(Boolean)
				.join(" / ");
			return [request.prompt, options ? `Options: ${options}` : ""]
				.filter(Boolean)
				.join("\n");
		})
		.filter(Boolean)
		.join("\n\n");

/** Nothing more is coming on this stream: eve's own session boundaries, plus
 * the step and turn failures that poison the turn without closing the session.
 * Mirrors isCurrentTurnBoundaryEvent | isTurnFailureEvent from eve/client,
 * which take a whole event where leaf only carries the type. */
export const isTerminalEveEventType = (eventType: string) =>
	eventType === "session.waiting" ||
	eventType === "session.completed" ||
	eventType === "session.failed" ||
	eventType === "turn.failed" ||
	eventType === "step.failed";
