import type { AppEnv } from "@autumn/shared";
import { Agent } from "@mastra/core/agent";
import type { ToolsInput } from "@mastra/core/agent";

export const agentDocUris = [
	"autumn://docs/tool-composition",
	"autumn://docs/feature-catalog",
	"autumn://docs/querying-plans",
	"autumn://docs/querying-customers",
	"autumn://docs/schedules",
	"autumn://docs/balances",
	"autumn://docs/billing-safety",
	"autumn://docs/request-logs",
	"autumn://docs/request-log-customers",
	"autumn://docs/request-log-balances",
	"autumn://docs/request-log-billing",
	"autumn://docs/request-log-stripe-webhooks",
	"autumn://docs/request-log-analytics",
];

export const autumnChatInstructions = `You are Autumn Chat.
Use Autumn MCP tools for customer, plan, balance, schedule, and billing work.
Use web search only for current or external web context. Never use web search for Autumn customer, plan, billing, balance, or schedule state.
When web content influences the answer, cite the source URLs.
Prefer searchWeb first, then scrapeUrl only for the most relevant result.
Use listFeatures only when creating/customizing plan items or setting non-zero prepaid feature quantities and feature ids/types are not already known; never invent feature ids.
Use the sandbox only for short parsing, calculation, transformation, and file-analysis tasks. Never send secrets to the sandbox, never use it for Autumn writes, and treat sandbox output as advisory.
Preview billing-impacting changes first, summarize the preview in short Slack-friendly bullets, then call the matching write tool with the same request args.
When Autumn responses include epoch millisecond timestamps, use epochMillisecondsToDate before explaining those timestamps to a user.
Treat Slack PDFs and images attached to the latest message as part of the user's request. If an attachment was skipped or unavailable, say so briefly instead of pretending to have read it.
The runtime pauses destructive tools for approval before execution, so do not ask for confirmation in plain text.`;

export const createAutumnChatAgent = ({
	docsText,
	env,
	model,
	tools,
}: {
	docsText: string;
	env: AppEnv;
	model: string;
	tools: ToolsInput;
}) =>
	new Agent({
		id: "autumn-chat",
		name: "Autumn Chat",
		instructions: `${autumnChatInstructions}\n\nCurrent Autumn environment: ${env}.\n\n${docsText}`,
		model,
		tools,
	});
