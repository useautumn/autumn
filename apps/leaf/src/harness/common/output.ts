import type { AutumnLogger } from "@autumn/logging";
import { CREDENTIAL_WITHHELD_MESSAGE } from "../../ui/messages.js";
import { containsSecret } from "./secrets.js";

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
	return CREDENTIAL_WITHHELD_MESSAGE;
};
