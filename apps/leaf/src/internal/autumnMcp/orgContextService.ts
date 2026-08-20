import type { AutumnLogger } from "@autumn/logging";
import { asRecord, parsePreviewPayload } from "@autumn/render";
import { type AppEnv, ms } from "@autumn/shared";
import { createTtlCache } from "../../lib/ttlCache.js";
import { executeAutumnMcpTool } from "./client.js";

export type AutumnOrgContext = {
	instructions?: string;
	text: string;
};

type ExecuteAutumnTool = typeof executeAutumnMcpTool;

const toJsonBlock = ({
	label,
	note,
	pretty = true,
	value,
}: {
	label: string;
	note?: string;
	pretty?: boolean;
	value: unknown;
}) =>
	`${label}${note ? ` (${note})` : ""}:\n\`\`\`json\n${JSON.stringify(value, null, pretty ? 2 : undefined)}\n\`\`\``;

const listOf = (value: unknown): Record<string, unknown>[] => {
	const unwrapped = Array.isArray(value)
		? value
		: (parsePreviewPayload(value) ?? value);
	const record = asRecord(unwrapped) ?? {};
	const list = [record.list, record.plans, record.features, unwrapped].find(
		Array.isArray,
	);
	return (list ?? []).map((entry) => asRecord(entry) ?? {});
};

const compactPrice = (price: unknown) => {
	const record = asRecord(price) ?? {};
	if (record.amount === undefined) return undefined;
	return `${record.amount}/${record.interval ?? "one_off"}`;
};

const compactItem = (item: unknown) => {
	const record = asRecord(item) ?? {};
	const featureId = record.feature_id ?? record.id;
	if (typeof featureId !== "string") return undefined;
	const parts = [featureId];
	if (record.included !== undefined && record.included !== null) {
		parts.push(`included=${record.included}`);
	}
	const price = asRecord(record.price) ?? {};
	if (price.billing_method) parts.push(String(price.billing_method));
	return parts.join(" ");
};

/** The 30KB pretty-printed listPlans/listFeatures dump is ~89% whitespace and
 * display noise; the orchestrator only routes and answers trivial questions,
 * so it gets a compact index and fetches details with its own tools. */
const compactPlans = (plans: unknown) =>
	listOf(plans).map((plan) => ({
		...(plan.add_on === true ? { add_on: true } : {}),
		id: plan.id,
		...(Array.isArray(plan.items) && plan.items.length
			? {
					items: plan.items
						.map(compactItem)
						.filter((item): item is string => Boolean(item)),
				}
			: {}),
		name: plan.name,
		...(compactPrice(plan.price) ? { price: compactPrice(plan.price) } : {}),
	}));

const compactFeatures = (features: unknown) =>
	listOf(features).map((feature) => ({
		id: feature.id,
		name: feature.name,
		...(feature.type ? { type: feature.type } : {}),
	}));

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
