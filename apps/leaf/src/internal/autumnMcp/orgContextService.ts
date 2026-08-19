import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv } from "@autumn/shared";
import { executeAutumnMcpTool } from "./client.js";

export type AutumnOrgContext = {
	instructions?: string;
	text: string;
};

type ExecuteAutumnTool = typeof executeAutumnMcpTool;

const toJsonBlock = ({ label, value }: { label: string; value: unknown }) =>
	`${label}:\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;

const withoutNotes = (value: unknown) => {
	if (!value || typeof value !== "object" || Array.isArray(value)) return value;
	const { notes: _notes, ...rest } = value as Record<string, unknown>;
	return rest;
};

const getNotes = (value: unknown) => {
	if (!value || typeof value !== "object" || Array.isArray(value)) return;
	const notes = (value as Record<string, unknown>).notes;
	return typeof notes === "string" && notes.trim() ? notes.trim() : undefined;
};

export const formatAutumnOrgContext = ({
	agentRules,
	features,
	organization,
	plans,
}: {
	agentRules?: unknown;
	features?: unknown;
	organization?: unknown;
	plans?: unknown;
}) => {
	const sections: string[] = [];
	if (organization !== undefined) {
		sections.push(
			toJsonBlock({ label: "getCurrentOrganization", value: organization }),
		);
	}
	if (agentRules !== undefined) {
		sections.push(
			toJsonBlock({ label: "getAgentRules", value: withoutNotes(agentRules) }),
		);
	}
	if (plans !== undefined) {
		sections.push(toJsonBlock({ label: "listPlans", value: plans }));
	}
	if (features !== undefined) {
		sections.push(toJsonBlock({ label: "listFeatures", value: features }));
	}

	return sections.join("\n\n");
};

export const loadAutumnOrgContext = async ({
	env,
	executeTool = executeAutumnMcpTool,
	logger,
	token,
}: {
	env: AppEnv;
	executeTool?: ExecuteAutumnTool;
	logger: AutumnLogger;
	token: string;
}): Promise<AutumnOrgContext | undefined> => {
	const intent =
		"Preload the org's identity, agent rules, plans, and features at session start so they are ready for the user's first request.";
	const args = { intent, request: {} };
	// getCurrentOrganization has a strict, no-argument input schema, so it only
	// accepts the required `intent` field — not the `request` wrapper.
	const organizationArgs = { intent };
	const [organizationResult, agentRulesResult, plansResult, featuresResult] =
		await Promise.allSettled([
			executeTool({
				env,
				token,
				toolName: "getCurrentOrganization",
				args: organizationArgs,
			}),
			executeTool({ env, token, toolName: "getAgentRules", args }),
			executeTool({ env, token, toolName: "listPlans", args }),
			executeTool({ env, token, toolName: "listFeatures", args }),
		]);

	const outcomes: Record<string, string> = {};
	for (const [toolName, result] of [
		["getCurrentOrganization", organizationResult],
		["getAgentRules", agentRulesResult],
		["listPlans", plansResult],
		["listFeatures", featuresResult],
	] as const) {
		if (result.status === "rejected") {
			outcomes[toolName] = "rejected";
			logger.warn("Could not preload Autumn org context", {
				event: "leaf.autumn_mcp_org_context_preload_failed",
				data: {
					error:
						result.reason instanceof Error
							? result.reason.message
							: String(result.reason),
					tool: toolName,
				},
			});
		} else {
			outcomes[toolName] = JSON.stringify(result.value).length.toString();
		}
	}
	logger.debug("Preloaded Autumn org context", {
		event: "leaf.autumn_mcp_org_context_preloaded",
		outcomes,
	});

	const text = formatAutumnOrgContext({
		agentRules:
			agentRulesResult.status === "fulfilled"
				? agentRulesResult.value
				: undefined,
		features:
			featuresResult.status === "fulfilled" ? featuresResult.value : undefined,
		organization:
			organizationResult.status === "fulfilled"
				? organizationResult.value
				: undefined,
		plans: plansResult.status === "fulfilled" ? plansResult.value : undefined,
	});

	const instructions =
		agentRulesResult.status === "fulfilled"
			? getNotes(agentRulesResult.value)
			: undefined;
	return text || instructions ? { instructions, text } : undefined;
};

export const autumnOrgContextService = {
	format: formatAutumnOrgContext,
	load: loadAutumnOrgContext,
};
