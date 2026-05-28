import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import * as z from "zod/v4";
import {
	type AutumnMcpAuth,
	createRequestContext,
	getAutumnAuth,
} from "./auth.js";
import { getLatestPendingAction } from "./pending-actions.js";
import { createAutumnOperationTools } from "./tools.js";

const model = "anthropic/claude-sonnet-4-6";

const instructions = `You are Autumn's operational billing assistant.
Use Autumn tools for customer, plan, and billing work.
Use Axiom tools only for read-only investigation of Autumn logs.

Rules:
- Read requests can be answered directly.
- For customer lookup, use listCustomers first when the id/email/name is ambiguous.
- For plan lookup, use listPlans first when the plan is ambiguous.
- For billing changes, call previewAttach or previewUpdateSubscription first. These preview tools automatically create the pending billing action.
- Never expose internal ids or server bookkeeping details.
- After a billing preview, tell the user to explicitly apply or approve the exact previewed change.
- If the user semantically confirms, applies, or approves a billing preview, call confirmBillingAction even if the preview is not visible in the current message. The tool validates whether a pending action exists.
- Never claim a billing write has been applied unless confirmBillingAction succeeds.
- If customer, plan, entity, subscription, or environment is ambiguous, ask a short clarifying question.
- Keep responses concise. Use JSON only when it materially helps debugging.`;

// To be added when we add axiom:
// - For log investigations, start with narrow structured fields such as context.customer_id, context.org_slug, req.url, req.id, stripe_event.id, stripe_event.type, workflow.id, or workflow.name.
// - For wide log windows, use a cheap aggregate query first, then focused <= 1 hour queries. Prefer ERROR/WARN levels first.
// - Axiom queries are already scoped to the authenticated org and environment; do not add or mention separate org filters unless useful to explain the investigation.
// - Axiom tools are read-only and must never be used as part of a billing confirmation or write flow.

const createAgent = () =>
	new Agent({
		id: "autumn-ops",
		name: "Autumn Ops",
		description:
			"Answers Autumn customer, plan, and billing questions using controlled Autumn operations.",
		instructions,
		model,
		tools: createAutumnOperationTools(),
	});

const getAuth = (
	toolContext: Parameters<
		NonNullable<ReturnType<typeof createTool>["execute"]>
	>[1],
	defaultAuth?: AutumnMcpAuth,
) => {
	try {
		return getAutumnAuth(toolContext);
	} catch (error) {
		if (defaultAuth) return defaultAuth;
		throw error;
	}
};

const getPendingAction = async (auth: AutumnMcpAuth) => {
	try {
		return await getLatestPendingAction(auth);
	} catch {
		return null;
	}
};

export const createAskAutumnTool = (defaultAuth?: AutumnMcpAuth) =>
	createTool({
		id: "ask_autumn",
		description:
			"Ask Autumn to look up customers/plans or safely preview and confirm billing changes.",
		inputSchema: z.object({
			message: z.string().min(1),
			context: z.record(z.string(), z.unknown()).optional(),
		}),
		mcp: {
			annotations: {
				title: "Ask Autumn",
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: false,
				openWorldHint: false,
			},
		},
		execute: async ({ message, context }, toolContext) => {
			const auth = getAuth(toolContext, defaultAuth);
			const pendingAction = await getPendingAction(auth);
			const contextText = context
				? `\n\nCaller context:\n${JSON.stringify(context, null, 2)}`
				: "";
			const pendingText = pendingAction
				? `\n\nPending billing action:\nTool: ${pendingAction.toolName}\nPreview: ${pendingAction.preview}\nIf the user confirms this preview, call confirmBillingAction.`
				: "";
			const output = await createAgent().generate(message, {
				maxSteps: 8,
				requestContext: createRequestContext(auth),
				context: [
					{
						role: "system",
						content: `Current Autumn environment: ${auth.env}.${pendingText}${contextText}`,
					},
				],
			});

			return output.text;
		},
	});

export const askAutumnTool = createAskAutumnTool();
