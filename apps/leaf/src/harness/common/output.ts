import type { AutumnLogger } from "@autumn/logging";
import { containsSecret } from "../../internal/sandbox/tool/guardrails.js";

const internalToolCallPattern = /<tool_call\b[\s\S]*?<\/tool_call>/i;

export const containsInternalToolCall = (text: string) =>
	internalToolCallPattern.test(text);

export const redactAgentOutput = ({
	logger,
	text,
}: {
	logger: AutumnLogger;
	text: string;
}) => {
	if (!text || !containsSecret(text)) return text;
	logger.error("Redacted suspected secret in agent output", {
		event: "leaf.agent_output_redacted",
	});
	return "[response withheld: it appeared to contain a credential]";
};
