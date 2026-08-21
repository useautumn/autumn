import type { AutumnLogger } from "@autumn/logging";
import { parsePreviewPayload } from "@autumn/render";
import { type AppEnv, ms } from "@autumn/shared";
import { createTtlCache } from "../../lib/ttlCache.js";
import { executeAutumnMcpTool } from "./client.js";
import {
	compactFeatures,
	compactPlans,
	toJsonBlock,
} from "./orgContextFormat.js";

export type AutumnOrgContext = {
	instructions?: string;
	text: string;
};

type ExecuteAutumnTool = typeof executeAutumnMcpTool;

// Preload results arrive as raw MCP envelopes; notes must be read off the
// parsed body or the org instructions silently never reach any agent.
const parsedAgentRules = (
	value: unknown,
): Record<string, unknown> | undefined => {
	const unwrapped = parsePreviewPayload(value) ?? value;
	if (!unwrapped || typeof unwrapped !== "object" || Array.isArray(unwrapped)) {
		return undefined;
	}
	return unwrapped as Record<string, unknown>;
};

const withoutNotes = (value: unknown) => {
	const rules = parsedAgentRules(value);
	if (!rules) return value;
	const { notes: _notes, ...rest } = rules;
	return rest;
};

const getNotes = (value: unknown) => {
	const notes = parsedAgentRules(value)?.notes;
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
		sections.push(
			toJsonBlock({
				label: "listPlans",
				note: "compact index — call getPlan/listPlans for full details",
				pretty: false,
				value: compactPlans(plans),
			}),
		);
	}
	if (features !== undefined) {
		sections.push(
			toJsonBlock({
				label: "listFeatures",
				note: "compact index",
				pretty: false,
				value: compactFeatures(features),
			}),
		);
	}

	return sections.join("\n\n");
};

const settledValue = <T>(result: PromiseSettledResult<T>) =>
	result.status === "fulfilled" ? result.value : undefined;

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
		agentRules: settledValue(agentRulesResult),
		features: settledValue(featuresResult),
		organization: settledValue(organizationResult),
		plans: settledValue(plansResult),
	});

	const instructions =
		agentRulesResult.status === "fulfilled"
			? getNotes(agentRulesResult.value)
			: undefined;
	return text || instructions ? { instructions, text } : undefined;
};

/** The block is org-level and changes rarely, but was refetched — four MCP
 * round trips — on every new thread. A short TTL keeps new threads instant
 * while catalog edits still surface within a minute. */
const orgContextCache = createTtlCache<AutumnOrgContext | undefined>({
	ttlMs: ms.minutes(1),
});

const loadAutumnOrgContextCached = ({
	env,
	logger,
	orgId,
	token,
}: {
	env: AppEnv;
	logger: AutumnLogger;
	orgId?: string;
	token: string;
}): Promise<AutumnOrgContext | undefined> => {
	if (!orgId) return loadAutumnOrgContext({ env, logger, token });
	return orgContextCache.getOrCreate(`${orgId}:${env}`, () =>
		loadAutumnOrgContext({ env, logger, token }),
	);
};

export const autumnOrgContextService = {
	format: formatAutumnOrgContext,
	load: loadAutumnOrgContextCached,
};
