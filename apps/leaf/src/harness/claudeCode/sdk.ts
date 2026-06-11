import * as claudeAgentSdkModule from "@anthropic-ai/claude-agent-sdk";
import { wrapClaudeAgentSDK } from "braintrust";
import { createBraintrustLogger } from "../../providers/braintrust/index.js";

// Braintrust traces every query()/tool execution when a logger is configured;
// otherwise the raw SDK is used and tracing is a no-op.
const braintrustLogger = createBraintrustLogger();

export const braintrustEnabled = Boolean(braintrustLogger);

export const claudeCodeSdk = braintrustEnabled
	? wrapClaudeAgentSDK(claudeAgentSdkModule)
	: claudeAgentSdkModule;
