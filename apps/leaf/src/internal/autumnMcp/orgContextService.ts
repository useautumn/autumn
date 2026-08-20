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

const getRecord = (value: unknown): Record<string, unknown> =>
	value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const unwrapMcpResult = (value: unknown): unknown => {
	const text = (value as { content?: Array<{ text?: string }> })?.content?.[0]
		?.text;
	if (typeof text !== "string") return value;
	try {
		return JSON.parse(text);
	} catch {
		return value;
	}
};

const listOf = (value: unknown): Record<string, unknown>[] => {
	const unwrapped = unwrapMcpResult(value);
	const record = getRecord(unwrapped);
	const list = [record.list, record.plans, record.features, unwrapped].find(
		Array.isArray,
	);
	return (list ?? []).map(getRecord);
};

const compactPrice = (price: unknown) => {
	const record = getRecord(price);
	if (record.amount === undefined) return undefined;
	return `${record.amount}/${record.interval ?? "one_off"}`;
};

const compactItem = (item: unknown) => {
	const record = getRecord(item);
	const featureId = record.feature_id ?? record.id;
	if (typeof featureId !== "string") return undefined;
	const parts = [featureId];
	if (record.included !== undefined && record.included !== null) {
		parts.push(`included=${record.included}`);
	}
	const price = getRecord(record.price);
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
			`listPlans (compact index — call getPlan/listPlans for full details):\n\`\`\`json\n${JSON.stringify(compactPlans(plans))}\n\`\`\``,
		);
	}
	if (features !== undefined) {
		sections.push(
			`listFeatures (compact index):\n\`\`\`json\n${JSON.stringify(compactFeatures(features))}\n\`\`\``,
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

const ORG_CONTEXT_TTL_MS = 60_000;
const orgContextCache = new Map<
	string,
	{ expiresAt: number; loaded: Promise<AutumnOrgContext | undefined> }
>();

/** The block is org-level and changes rarely, but was refetched — four MCP
 * round trips — on every new thread. A short TTL keeps new threads instant
 * while catalog edits still surface within a minute. */
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
	const key = `${orgId}:${env}`;
	const cached = orgContextCache.get(key);
	if (cached && cached.expiresAt > Date.now()) return cached.loaded;
	const loaded = loadAutumnOrgContext({ env, logger, token });
	orgContextCache.set(key, {
		expiresAt: Date.now() + ORG_CONTEXT_TTL_MS,
		loaded,
	});
	loaded
		.then((value) => {
			if (value === undefined) orgContextCache.delete(key);
		})
		.catch(() => orgContextCache.delete(key));
	return loaded;
};

export const autumnOrgContextService = {
	format: formatAutumnOrgContext,
	load: loadAutumnOrgContextCached,
};
