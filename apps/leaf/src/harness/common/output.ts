import type { AutumnLogger } from "@autumn/logging";
import { containsSecret } from "../../internal/sandbox/tool/guardrails.js";

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
