import { normalizeToolName, toolGerund } from "../../agent/tools/toolPolicy.js";

export type EveAction = {
	callId?: string;
	description?: string;
	input?: unknown;
	kind?: string;
	name?: string;
	subagentName?: string;
	toolName?: string;
};

export type EveActionResult = {
	callId?: string;
	kind?: string;
	name?: string;
	output?: unknown;
	subagentName?: string;
	toolName?: string;
};

export type EveInputRequest = {
	action?: {
		callId?: string;
		input?: Record<string, unknown>;
		kind?: string;
		toolName?: string;
	};
	display?: string;
	options?: Array<{ label?: string; id?: string }>;
	prompt?: string;
	requestId?: string;
};

const labelForAction = (action?: EveAction) =>
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

export const approvalOptionIds = (request: EveInputRequest) => {
	const options = request.options ?? [];
	const optionText = (option: { id?: string; label?: string }) =>
		`${option.id ?? ""} ${option.label ?? ""}`.toLowerCase();
	const byPattern = (pattern: RegExp) =>
		options.find((option) => pattern.test(optionText(option)))?.id;
	// Never invent an id absent from the request — eve rejects unknown option
	// ids, so fall back to a real option before the bare literal.
	const approve =
		byPattern(/\b(approve|apply|confirm|allow|yes)\b/) ??
		options[0]?.id ??
		"approve";
	const deny =
		byPattern(/\b(deny|reject|discard|cancel|no)\b/) ??
		options.at(-1)?.id ??
		"deny";
	return { approve, deny };
};

export const textForInputRequests = (requests: EveInputRequest[]) =>
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
