import { leafSkillsFor, skillToText } from "@autumn/agent-docs/agent";
import { askJev, type JevMeasurement } from "./jev.js";

export type ToolCall = { name: string; args: Record<string, unknown> };
export type CallTool = (call: ToolCall) => Promise<unknown>;

export const unpackToolResult = (value: unknown): unknown => {
	const result = value as {
		error?: unknown;
		isError?: boolean;
		content?: Array<{ type: string; text?: string }>;
	};
	if (result?.isError) throw new Error("Autumn tool returned an error");
	if (result?.error) throw new Error("Autumn API returned an error");
	const text = result.content?.find((item) => item.type === "text")?.text;
	if (!text) return value;
	const parsed = JSON.parse(text);
	if (parsed?.error) throw new Error("Autumn API returned an error");
	return parsed;
};

export const prepareContext = async ({
	messages,
	mode,
	call,
	onMeasurement,
}: {
	messages: unknown;
	mode: string;
	call: CallTool;
	onMeasurement: (measurement: JevMeasurement) => void;
}) => {
	const skills = leafSkillsFor("leaf").filter(
		(skill) => skill.name !== "autumn-billing",
	);
	if (mode !== "jev")
		return {
			markdown: skills.map(skillToText).join("\n\n"),
			evidence: { messages },
		};
	const names = ["getAgentRules", "listPlans", "listFeatures", "listCustomers"];
	const values = await Promise.all(
		names.map(async (name) =>
			unpackToolResult(
				await call({
					name,
					args: {
						request: {},
						intent: "Load current billing context for the user request",
					},
				}),
			),
		),
	);
	const facts = Object.fromEntries(
		names.map((name, index) => [name, values[index]]),
	);
	const customers =
		(facts.listCustomers as { list?: Array<{ id: string; name?: string }> })
			.list ?? [];
	const questions = Object.fromEntries([
		[
			"operation_attach",
			"Does the user request adding, assigning, attaching, or switching a customer's plan? Previewing and obtaining approval are steps of that SAME attach request, not separate billing changes. Use customer state to distinguish this from modifying an already-attached plan.",
		],
		[
			"operation_updateSubscription",
			"Does the user request changing the terms of a plan that is ALREADY attached to this customer, rather than attaching a new plan? Preview and approval are procedural steps, not additional billing changes.",
		],
		[
			"operation_createSchedule",
			"Does the user request a subscription schedule with future plan phases, rather than attaching a plan now? Merely saying after approval does not request a schedule.",
		],
		...skills.map((skill, index) => [
			`skill_${index}`,
			`Is the skill ${JSON.stringify({ name: skill.name, description: skill.description })} useful for the latest user request in messages?`,
		]),
		...customers.map((customer, index) => [
			`customer_${index}`,
			`Does the latest user request in messages identify customer ${JSON.stringify(customer)} as its target? Do not select an unrelated customer.`,
		]),
	]);
	const selected = await askJev({
		state: { messages, facts },
		questions,
		onMeasurement,
	});
	const relevantSkills = skills.filter(
		(_skill, index) => (selected[`skill_${index}`] ?? 0) >= 0.5,
	);
	const targets = customers.filter(
		(_customer, index) => (selected[`customer_${index}`] ?? 0) >= 0.7,
	);
	const target = targets.length === 1 ? targets[0] : undefined;
	const details = target
		? await Promise.all(
				["getCustomer", "listEntities"].map(async (name) => ({
					name,
					result: unpackToolResult(
						await call({
							name,
							args: {
								request: { customer_id: target.id },
								intent: "Read the selected customer's billing state",
							},
						}),
					),
				})),
			)
		: [];
	const evidence = { messages, facts, details };
	const operations = ["attach", "updateSubscription", "createSchedule"].filter(
		(operation) => (selected[`operation_${operation}`] ?? 0) >= 0.7,
	);
	return {
		evidence,
		operation: operations.length === 1 ? operations[0] : undefined,
		selection: selected,
		markdown: [
			"The following are current tool results fetched for this turn. Reuse them; do not repeat reads unless facts are missing or stale. A missing or ambiguous customer still requires a lookup or clarification.",
			JSON.stringify({ facts, details }),
			...relevantSkills.map(skillToText),
		].join("\n\n"),
	};
};

export const verifyProposal = async ({
	evidence,
	call,
	onMeasurement,
	onVerdict,
}: {
	evidence: unknown;
	call: ToolCall;
	onMeasurement: (measurement: JevMeasurement) => void;
	onVerdict: (answers: Record<string, number>) => void;
}) => {
	const rules = (
		evidence as {
			facts?: {
				getAgentRules?: {
					entity_rules?: { attach_to_entities?: boolean };
					notes?: string;
				};
			};
		}
	).facts?.getAgentRules;
	const request = call.args.request as Record<string, unknown> | undefined;
	if (
		call.name === "attach" &&
		rules?.entity_rules?.attach_to_entities === true &&
		!request?.entity_id
	) {
		throw new Error(
			"Org rules require attaching to an entity; resolve entity_id before proposing attach",
		);
	}
	const answers = await askJev({
		state: {
			evidence,
			proposal: call,
			status:
				"Unexecuted proposal. A separate human approval is required before any billing write executes.",
		},
		questions: {
			wrong_target:
				"Does the proposal target a customer or plan that contradicts the original user request or authoritative tool results?",
			wrong_price:
				"Does the proposal contradict an explicitly requested price, currency, or billing interval? Custom overrides are valid. Unspecified values are not errors merely because absent.",
			missing_terms:
				"Does the proposal omit an explicitly requested trial, allowance, overage rate, or effective date? Judge the actual original messages, not an imagined requirement.",
			...(rules?.notes?.trim()
				? {
						violates_rules: `Does the proposal contradict an explicit requirement in these organization notes: ${JSON.stringify(rules.notes)}? Evaluate only these written requirements, not structured flags or imagined policies.`,
					}
				: {}),
		},
		onMeasurement,
	});
	onVerdict(answers);
	const flags = Object.entries(answers)
		.filter(([, probability]) => probability >= 0.7)
		.map(([name]) => name);
	if (flags.length)
		throw new Error(`Proposal needs correction: ${flags.join(", ")}`);
	return answers;
};
