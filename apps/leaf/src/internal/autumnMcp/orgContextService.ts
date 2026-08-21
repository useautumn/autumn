import type { AutumnLogger } from "@autumn/logging";
import { parsePreviewPayload } from "@autumn/render";
import { type AppEnv, ms } from "@autumn/shared";
import { createTtlCache } from "../../lib/ttlCache.js";
import { executeAutumnMcpTool } from "./client.js";
import { autumnMcpErrorText } from "./errorResult.js";
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
	const requestArgs = { intent, request: {} };
	const preloadTool = async (
		toolName: string,
		callArgs: Record<string, unknown>,
	) => {
		const startedAt = Date.now();
		const value = await executeTool({ args: callArgs, env, token, toolName });
		return {
			bytes: JSON.stringify(value).length,
			durationMs: Date.now() - startedAt,
			errorText: autumnMcpErrorText(value),
			toolName,
			value,
		};
	};
	const settled = await Promise.allSettled([
		preloadTool("getCurrentOrganization", { intent }),
		preloadTool("getAgentRules", requestArgs),
		preloadTool("listPlans", requestArgs),
		preloadTool("listFeatures", requestArgs),
	]);
	const toolNames = [
		"getCurrentOrganization",
		"getAgentRules",
		"listPlans",
		"listFeatures",
	];
	const preloads = settled.map((result, index) => {
		if (result.status === "rejected") {
			return { status: "rejected", tool: toolNames[index] };
		}
		const { bytes, durationMs, errorText, toolName } = result.value;
		return {
			bytes,
			duration_ms: durationMs,
			status: errorText ? "error" : "ok",
			tool: toolName,
		};
	});
	const preloadedValue = (index: number) => {
		const result = settled[index];
		if (!result) return;
		if (result.status === "rejected") {
			// A throw can predate the MCP call (pool/connect), so it is not
			// guaranteed to have been logged at the tool boundary.
			logger.warn("Could not preload Autumn org context", {
				event: "leaf.autumn_mcp_org_context_preload_failed",
				data: { error: result.reason, tool: toolNames[index] },
			});
			return;
		}
		if (result.value.errorText) {
			// executeAutumnMcpTool already warned with the error detail.
			logger.debug("Skipping failed Autumn org context preload", {
				event: "leaf.autumn_mcp_org_context_preload_failed",
				data: { tool: toolNames[index] },
			});
			return;
		}
		return result.value.value;
	};

	const organization = preloadedValue(0);
	const agentRules = preloadedValue(1);
	const plans = preloadedValue(2);
	const features = preloadedValue(3);

	logger.info("Preloaded Autumn org context", {
		event: "leaf.autumn_mcp_org_context_preloaded",
		data: { preloads },
	});

	const text = formatAutumnOrgContext({
		agentRules,
		features,
		organization,
		plans,
	});

	const instructions = getNotes(agentRules);
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
