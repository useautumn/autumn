import { leafSkillsFor, skillToText } from "@autumn/agent-docs/agent";
import type { AutumnMcpToolMetadata } from "../../../leaf/src/internal/autumnMcp/rpcClient.js";
import { askJev, type JevMeasurement } from "../../lib/jev.js";
import type { NativeMode } from "./protocol.js";

export const nativeInstructions = [
	"This is an isolated modeled sandbox. Only the tools can read or change its state. Do not claim production or processor verification.",
	"Reuse authoritative context already supplied in the conversation. If it fully answers a read-only question, answer without tools. Otherwise make visible tool calls for missing facts; never guess records or prices.",
	"Answer catalog questions from context blocks the user supplies in the message when those blocks already contain the answer; make no tool call in that case. When the question asks for detail the supplied context does not contain (usage tiers, overage rates, entitlements), call getPlan with the plan ID before answering; use listPlans only to find an unknown plan ID first, never as a substitute for getPlan on a specific plan. Never turn a catalog question into a write.",
	"Retain resolved customer IDs and unmodified terms across follow-ups. A pricing question is not a new write. Refuse rollback of already-applied billing changes and refer the user to the Autumn team.",
	"Every write is a real Eve approval-gated tool call. Preview billing requests first using the exact request body. Never say a pending write has executed. The approval card is the confirmation: do not emit separate confirmation prose on a write-proposal turn.",
	"When the user requests several writes together, prepare all their exact requests and previews, then call the write tools together in one tool-call batch. Put the same complete, grounded approval_description on every write in that batch, describing all changes. Actual execution remains approval-gated.",
	"A clarification about a pending request gets a text answer, not another call to its write tool. A concrete refinement gets a fresh preview and replacement write, retaining unchanged terms. Start its summary with Updated or Added; explain trial length, recurring price, invoice/charge outcome and the concrete trial-end date without API jargon.",
	"The old immutable proposal remains authoritative after cancellation. Adding a trial while keeping everything else unchanged does not authorize removing invoice mode or immediate access. No-card trials default card_required to false and cannot use invoice mode unless on_end is revert. A card-required trial can preserve invoicing only if an observed payment method already satisfies it or the user explicitly accepts that new requirement. Otherwise explain the compatibility constraint and clarify the choice; do not invent consent or silently switch billing mode. Resolve this compatibility before canceling the old approval.",
	"For a schedule, use known catalog defaults to resolve an unspecified variant and preserve all explicit phase, trial, price and entitlement terms. Ask only when necessary facts truly cannot be resolved safely.",
	"Schedule starting_after offsets are relative to the immediately previous phase, not the first phase. Uniform annual phases use a one-year offset each time; compute cumulative dates before describing them.",
].join("\n\n");

export const selectNativeContext = async ({
	mode,
	messages,
	tools,
	onMeasurement,
	today,
}: {
	mode: NativeMode;
	messages: unknown;
	tools: AutumnMcpToolMetadata[];
	onMeasurement: (measurement: JevMeasurement) => void;
	today: string;
}) => {
	const skills = leafSkillsFor("leaf");
	if (mode !== "jev")
		return {
			content: [
				nativeInstructions,
				`Current date: ${today}`,
				...skills.map(skillToText),
			].join("\n\n"),
			tools,
		};
	const selection = await askJev({
		state: { messages },
		questions: Object.fromEntries([
			...skills.map((skill, index) => [
				`skill_${index}`,
				`Is this skill relevant to the current request including carried-over terms? ${skill.name}: ${skill.description}`,
			]),
			...tools.map((tool, index) => [
				`tool_${index}`,
				`Could this tool be needed to safely complete the current request, including reading prerequisites or previewing before approval? Retain tools needed by the original request across follow-ups. ${tool.name}: ${tool.description}`,
			]),
		]),
		onMeasurement,
	});
	return {
		content: [
			nativeInstructions,
			`Current date: ${today}`,
			...skills
				.filter((_skill, index) => (selection[`skill_${index}`] ?? 0) >= 0.5)
				.map(skillToText),
		].join("\n\n"),
		tools: tools.filter(
			(_tool, index) => (selection[`tool_${index}`] ?? 0) >= 0.35,
		),
		selection,
	};
};
