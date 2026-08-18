import { formatMoney, parsePreviewPayload } from "@autumn/render";
import type { AgentActionProgress } from "../internal/agentRuntime/domain/agentTurnContext.js";
import {
	isToolErrorResult,
	normalizeToolName,
} from "../internal/agentRuntime/tools/toolPolicy.js";

const actionOutput = ({ output, toolName }: AgentActionProgress) => {
	if (!toolName) return undefined;
	const payload = parsePreviewPayload(output);
	if (!payload) return undefined;
	const name = normalizeToolName(toolName);
	if (name === "listPlans" || name === "listCustomers") {
		const items =
			payload.list ?? payload.plans ?? payload.customers ?? payload.results;
		if (!Array.isArray(items)) return undefined;
		const noun = name === "listPlans" ? "plans" : "customers";
		return `${items.length} ${noun} loaded${payload.next_cursor ? " · More available" : ""}`;
	}
	if (!name.startsWith("preview") || typeof payload.total !== "number") {
		return undefined;
	}
	const currency =
		typeof payload.currency === "string" ? payload.currency : "usd";
	const nextCycle = parsePreviewPayload(payload.next_cycle);
	return [
		`${formatMoney({ amount: payload.total, currency })} due now`,
		typeof nextCycle?.total === "number"
			? `${formatMoney({ amount: nextCycle.total, currency })} next cycle`
			: undefined,
		payload.redirect_to_checkout === true ? "Checkout required" : undefined,
	]
		.filter((part): part is string => Boolean(part))
		.join(" · ");
};

export const actionProgressResult = (progress: AgentActionProgress) => {
	const failed =
		progress.status === "failed" || isToolErrorResult(progress.output);
	return {
		output: failed ? "Couldn’t complete" : actionOutput(progress),
		status: failed ? ("error" as const) : ("complete" as const),
	};
};
