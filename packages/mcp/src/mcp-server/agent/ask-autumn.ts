import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import * as z from "zod/v4";
import {
	createRequestContext,
	getAutumnAuth,
	type AutumnMcpAuth,
} from "./auth.js";
import {
	cancelLatestPendingAction,
	cancelPendingAction,
	claimLatestPendingAction,
	claimPendingAction,
} from "./pending-actions.js";
import {
	createAutumnOperationTools,
	executeConfirmedBillingAction,
} from "./tools.js";

const model = "anthropic/claude-sonnet-4-6";

const tokenPattern = /\bact_[a-f0-9-]{8}\b/i;

const instructions = `You are Autumn's operational billing assistant.
Use Autumn tools for customer, plan, and billing work.

Rules:
- Read requests can be answered directly.
- For customer lookup, use listCustomers first when the id/email/name is ambiguous.
- For plan lookup, use listPlans first when the plan is ambiguous.
- For billing changes, call previewAttach or previewUpdateSubscription first.
- After a billing preview, call createBillingConfirmation with the exact write request and a concise preview summary.
- Never expose internal ids or server bookkeeping details.
- After a billing preview, tell the user to reply with confirm to apply the exact previewed change, or cancel to discard it.
- Never claim a billing write has been applied unless the user confirms and the confirmed action succeeds.
- If customer, plan, entity, subscription, or environment is ambiguous, ask a short clarifying question.
- Keep responses concise. Use JSON only when it materially helps debugging.`;

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

const getToken = (message: string) => message.match(tokenPattern)?.[0];

const isConfirm = (message: string) => /^\s*(confirm|approve|yes)\b/i.test(message);
const isCancel = (message: string) => /^\s*(cancel|decline|no)\b/i.test(message);

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

export const createAskAutumnTool = (defaultAuth?: AutumnMcpAuth) => createTool({
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
		const token = getToken(message);

		if (isCancel(message)) {
			if (token) {
				cancelPendingAction(auth, token);
			} else {
				cancelLatestPendingAction(auth);
			}
			return "Cancelled the pending billing action.";
		}

		if (isConfirm(message)) {
			const action = token
				? claimPendingAction(auth, token)
				: claimLatestPendingAction(auth);
			const result = await executeConfirmedBillingAction({
				auth,
				toolName: action.toolName,
				request: action.request,
			});
			return {
				message: `Confirmed and applied ${action.toolName}.`,
				result,
			};
		}

		const contextText = context
			? `\n\nCaller context:\n${JSON.stringify(context, null, 2)}`
			: "";
		const output = await createAgent().generate(message, {
			maxSteps: 8,
			requestContext: createRequestContext(auth),
			context: [
				{
					role: "system",
					content: `Current Autumn environment: ${auth.env}.${contextText}`,
				},
			],
		});

		return output.text;
	},
});

export const askAutumnTool = createAskAutumnTool();
