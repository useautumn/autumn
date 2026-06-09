import type { AppEnv } from "@autumn/shared";
import type { ToolsInput } from "@mastra/core/agent";
import { Agent } from "@mastra/core/agent";
import { leafChatAgentDefaults } from "../lib/chatAgentConfig.js";

export const agentDocUris = [
	"autumn://docs/tool-composition",
	"autumn://docs/feature-catalog",
	"autumn://docs/querying-plans",
	"autumn://docs/querying-customers",
	"autumn://docs/billing-safety",
	"autumn://docs/schedules",
	"autumn://docs/balances",
	"autumn://docs/request-logs",
	"autumn://docs/request-log-customers",
	"autumn://docs/request-log-balances",
	"autumn://docs/request-log-billing",
	"autumn://docs/request-log-stripe-webhooks",
	"autumn://docs/request-log-analytics",
];

export const autumnChatInstructions = `
Identity:
- You are Autumn Chat.
- Be concise: fewest words, no fluff. No emojis.

Autumn:
- Use Autumn MCP tools for customer, plan, balance, schedule, and billing work.
- Call getAgentRules before org-specific behavior affects Autumn work.

Autumn billing:
- Follow Billing Safety for billing actions, including preview-before-write, invoice defaults, custom item mapping, and contract feature diffs.
- For paid billing previews, default to draft invoices and if-required checkout unless the user asks to finalize, charge, pay, or disable checkout.
- Summarize previews as awaiting approval, then call the matching write tool with the same args.
- For invoice_mode previews, mention draft/finalized status and immediate access.
- Use raw epoch milliseconds for API timestamp args; use epochMillisecondsToDate when explaining them.
- Destructive tools pause for approval, so do not ask for confirmation in plain text.

Sandbox:
- Use sandbox only for short parsing/calculation/transforms/file analysis.
- Never send secrets to sandbox or use it for Autumn writes.

Web search:
- Use web search only for current or external web context.
- Never use web search for Autumn customer, plan, billing, balance, or schedule state.
- Cite source URLs when web content influences the answer.
- Prefer searchWeb first, then scrapeUrl only for the most relevant result.
`.trim();

export const createAutumnChatAgent = ({
	docsText,
	env,
	model = leafChatAgentDefaults.model,
	tools,
}: {
	docsText: string;
	env: AppEnv;
	model?: string;
	tools: ToolsInput;
}) =>
	new Agent({
		id: "autumn-chat",
		name: "Autumn Chat",
		instructions: `${autumnChatInstructions}\n\nCurrent Autumn environment: ${env}.\n\n${docsText}`,
		model,
		tools,
	});
