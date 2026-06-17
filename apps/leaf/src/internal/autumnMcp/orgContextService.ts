import type { AutumnLogger } from "@autumn/logging";
import type { AppEnv } from "@autumn/shared";
import { executeAutumnMcpTool } from "./client.js";

export type AutumnOrgContext = {
	text: string;
};

type ExecuteAutumnTool = typeof executeAutumnMcpTool;

const toJsonBlock = ({ label, value }: { label: string; value: unknown }) =>
	`${label}:\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;

export const formatAutumnOrgContext = ({
	agentRules,
	features,
	plans,
}: {
	agentRules?: unknown;
	features?: unknown;
	plans?: unknown;
}) => {
	const sections: string[] = [];
	if (agentRules !== undefined) {
		sections.push(toJsonBlock({ label: "getAgentRules", value: agentRules }));
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
		"Preload the org's agent rules, plans, and features at session start so they are ready for the user's first request.";
	const args = { intent, request: {} };
	const [agentRulesResult, plansResult, featuresResult] =
		await Promise.allSettled([
			executeTool({ env, token, toolName: "getAgentRules", args }),
			executeTool({ env, token, toolName: "listPlans", args }),
			executeTool({ env, token, toolName: "listFeatures", args }),
		]);

	const outcomes: Record<string, string> = {};
	for (const [toolName, result] of [
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
		plans: plansResult.status === "fulfilled" ? plansResult.value : undefined,
	});

	return text ? { text } : undefined;
};

export const autumnOrgContextService = {
	format: formatAutumnOrgContext,
	load: loadAutumnOrgContext,
};
