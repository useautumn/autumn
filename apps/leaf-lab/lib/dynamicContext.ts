import {
	leafSkillBundle,
	leafSkillsFor,
	skillToText,
} from "@autumn/agent-docs/agent";
import * as z from "zod/v4";
import { toolDomains } from "../../../packages/mcp/src/tools/domains.js";
import { type CallTool, type ToolCall, unpackToolResult } from "./context.js";
import { askJev, type JevMeasurement } from "./jev.js";

const supportedOperations = new Set([
	"attach",
	"updateSubscription",
	"createSchedule",
	"updateCustomer",
	"getOrCreateCustomer",
	"createEntity",
]);
const clarificationQuestions = {
	needs_scope_clarification:
		"Does an outstanding actual billing change have multiple plausible customer/entity scopes with no user choice resolving them? Use the COMPLETE conversation, document text, pending proposals, completed results, and authoritative customer/entity reads. Explicit customer-level scope is a valid choice even when org defaults prefer entities. A uniquely identified existing subscription can resolve its own scope. Multiple deliberately requested targets are not ambiguity. Read-only questions do not require billing-scope clarification. Flag only a missing choice that must be asked before any billing preview or proposal.",
	needs_price_clarification:
		"Does an outstanding attach or schedule action target a custom/Enterprise placeholder plan whose authoritative base price is null, without an explicit user-supplied custom price or agreement that this attachment is free? Consider the COMPLETE conversation, documents, pending proposals and completed actions. A null placeholder price is not consent to free billing; do not invent a price or copy unrelated prices. Do not flag existing-subscription updates, cancellations, read-only questions, genuinely free catalog plans, or a price/free agreement already explicitly supplied by the user. Flag only missing pricing consent that must be asked before any billing preview or proposal.",
	needs_identity_clarification:
		"Does the user explicitly request creating a new customer or entity but omit required user identity information needed to identify that new record? Use the COMPLETE conversation, documents, pending proposals, completed results, and authoritative reads. Do not invent customer/entity identifiers or required identity fields. Do not demand optional names/emails merely because absent, or flag an existing record whose identity is resolved. For a new entity also require its parent customer and defining feature to be resolved. Flag only missing required creation information that must be asked before proposing the action.",
};
const candidates = toolDomains
	.flatMap((domain) => [
		...(domain.operations ?? []),
		...(domain.confirmedWrites ?? []),
	])
	.filter((tool) => supportedOperations.has(tool.id))
	.map((tool) => {
		const customize =
			tool.schema instanceof z.ZodObject
				? tool.schema.shape.customize
				: undefined;
		const customization =
			customize instanceof z.ZodOptional ? customize.unwrap() : customize;
		const itemChanges =
			customization instanceof z.ZodObject
				? ["add_items", "remove_items"].map((field) => {
						const description = customization.shape[field]?.description;
						return description
							? `customize.${field}: ${description}`
							: undefined;
					})
				: [];
		const cancellation =
			tool.schema instanceof z.ZodObject
				? tool.schema.shape.cancel_action?.description
				: undefined;
		return {
			name: tool.id,
			description: [tool.description, cancellation, ...itemChanges]
				.filter(Boolean)
				.join("\n"),
		};
	});

type ReadResult = {
	name: string;
	args: Record<string, unknown>;
	result: unknown;
};
type ListedRecord = { id: string; [key: string]: unknown };
const listedRecords = (result: unknown): ListedRecord[] => {
	const list = (result as { list?: unknown })?.list;
	if (!Array.isArray(list)) return [];
	return list.filter(
		(item): item is ListedRecord =>
			item !== null && typeof item === "object" && typeof item.id === "string",
	);
};

export const prepareDynamicContext = async ({
	messages,
	call,
	onMeasurement,
	pending = [],
	completed = [],
	today = new Date(),
}: {
	messages: Array<{ role: string; content: string }>;
	call: CallTool;
	onMeasurement: (measurement: JevMeasurement) => void;
	pending?: ToolCall[];
	completed?: Array<{ call: ToolCall; result: unknown }>;
	today?: Date | string;
}) => {
	const reads: ReadResult[] = [];
	const read = async (name: string, request: Record<string, unknown> = {}) => {
		const args = {
			request,
			intent: "Read authoritative context for the complete user conversation",
		};
		const result = unpackToolResult(await call({ name, args }));
		reads.push({ name, args, result });
		return result;
	};
	const readList = async (
		name: string,
		request: Record<string, unknown> = {},
	) => {
		const paginated = name === "listCustomers" || name === "listEntities";
		if (!paginated) return read(name, request);
		const list: ListedRecord[] = [];
		const cursors = new Set<string>();
		let cursor: string | undefined;
		for (let page = 0; page < 20; page++) {
			const result = (await read(name, {
				...request,
				limit: 100,
				...(cursor ? { start_cursor: cursor } : {}),
			})) as Record<string, unknown>;
			list.push(...listedRecords(result));
			const next = result.next_cursor;
			if (typeof next !== "string" || !next)
				return { ...result, list, context_truncated: false };
			if (cursors.has(next) || page === 19)
				return { ...result, list, context_truncated: true };
			cursors.add(next);
			cursor = next;
		}
		throw new Error("Unreachable pagination state");
	};
	const names = ["getAgentRules", "listPlans", "listFeatures", "listCustomers"];
	const values = await Promise.all(names.map((name) => readList(name)));
	const facts = Object.fromEntries(
		names.map((name, index) => [name, values[index]]),
	);
	const skills = leafSkillsFor("leaf").filter(
		(skill) => skill.name !== "autumn-billing",
	);
	const customers = listedRecords(facts.listCustomers);
	const dateAnchors = [
		...new Set(
			messages
				.filter(({ role }) => role === "user")
				.flatMap(({ content }) =>
					[...content.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].map(([date]) => date),
				),
		),
	].flatMap((date) => {
		const epochMs = Date.parse(`${date}T00:00:00.000Z`);
		return Number.isFinite(epochMs) &&
			new Date(epochMs).toISOString().slice(0, 10) === date
			? [{ date, utcMidnightEpochMs: epochMs }]
			: [];
	});
	const evidence = {
		messages,
		facts,
		details: [] as ReadResult[],
		reads,
		pending,
		completed,
		today: today instanceof Date ? today.toISOString() : today,
		dateAnchors,
		dateAnchorMeaning:
			"UTC-midnight arithmetic references for date strings present in user-provided text. These do not select a date or override an explicitly requested time/timezone; use the user's actual phase dates.",
	};
	const { reads: _reads, ...context } = evidence;
	const operationQuestions = Object.fromEntries(
		candidates.map((tool) => [
			`operation_${tool.name}`,
			`Is this operation needed for an outstanding user-requested action? ${JSON.stringify(tool)} Consider the COMPLETE conversation, document text, pending proposals and completed results. Select every needed operation for multi-action requests, not just one. attach requires a customer target and subscribes that customer to an existing plan. Adding or removing features, boolean flags, allowances, or plan items on an already attached plan changes that existing subscription; use the operation's customization capabilities, not a new attachment or entity creation merely because the user says add. Distinguish a genuinely different plan/product line using authoritative subscriptions. A short confirmation or pricing question does not erase the original request. Do not repeat completed actions. Preview/approval are steps of an action, not separate actions. Read-only or clarification requests need no write operation.`,
		]),
	);
	let selection = await askJev({
		state: context,
		questions: {
			...operationQuestions,
			...Object.fromEntries(
				skills.map((skill, index) => [
					`skill_${index}`,
					`Is this skill useful for the complete conversation and its outstanding actions? ${JSON.stringify({ name: skill.name, description: skill.description })}`,
				]),
			),
			...Object.fromEntries(
				customers.map((customer, index) => [
					`customer_${index}`,
					`Is this customer a relevant target of the complete conversation, pending proposals, or follow-up about completed actions? Select ALL requested targets, but not unrelated customers. ${JSON.stringify(customer)}`,
				]),
			),
			pending_confirmation:
				"Does the latest user message unambiguously approve the pending proposal without changing its terms?",
			pending_question:
				"Does the latest user message ask a question about the pending proposal rather than authorize execution?",
			pending_change:
				"Does the latest user message request changing the pending proposal's terms or targets?",
		},
		onMeasurement,
	});
	const targetIds = new Set<string>();
	customers.forEach((customer, index) => {
		if ((selection[`customer_${index}`] ?? 0) >= 0.7)
			targetIds.add(customer.id);
	});
	for (const item of [...pending, ...completed.map((entry) => entry.call)]) {
		const request = item.args.request as Record<string, unknown> | undefined;
		if (typeof request?.customer_id === "string")
			targetIds.add(request.customer_id);
	}
	const entities: Array<{ customer_id: string; entity: ListedRecord }> = [];
	await Promise.all(
		[...targetIds].map(async (customer_id) => {
			const customer = await read("getCustomer", { customer_id });
			evidence.details.push({
				name: "getCustomer",
				args: { request: { customer_id } },
				result: customer,
			});
			const result = await readList("listEntities", { customer_id });
			evidence.details.push({
				name: "listEntities",
				args: { request: { customer_id } },
				result,
			});
			for (const entity of listedRecords(result))
				entities.push({ customer_id, entity });
		}),
	);
	selection = {
		...selection,
		...(await askJev({
			state: context,
			questions: {
				...operationQuestions,
				...clarificationQuestions,
				mutation_requested:
					"Does the complete conversation contain an outstanding request to change billing/subscription state, including adding/removing a feature, flag, allowance, or plan item on an existing subscription? Consider pending proposals and completed actions. A request only to read/explain current state or prices, or to edit customer metadata/create an unrelated entity, is not a billing mutation. A follow-up question or short confirmation does not erase an outstanding earlier billing change, but completed changes alone do not count. This relevance signal retains capabilities only; it never authorizes a write.",
				...Object.fromEntries(
					entities.map((entity, index) => [
						`entity_${index}`,
						`Is this entity relevant to the requested billing action or subscription question, requiring its full current subscription state? ${JSON.stringify(entity)} Consider the complete conversation and pending/completed actions. Placement of a NEW attachment is separate from the scopes of existing subscriptions the user wants changed or canceled. Explicit customer-level placement does not remove existing entity-scoped subscriptions from a requested cleanup. Respect explicit customer-level scope for new attachments; org defaults alone do not require selecting an entity.`,
					]),
				),
			},
			onMeasurement,
		})),
	};
	const entityReads = new Map<
		string,
		{ customer_id: string; entity_id: string }
	>();
	entities.forEach(({ customer_id, entity }, index) => {
		const subscriptions = entity.subscriptions;
		const retainExistingSubscriptions =
			(selection.mutation_requested ?? 0) >= 0.5 &&
			Array.isArray(subscriptions) &&
			subscriptions.some(
				(subscription) =>
					subscription?.status === "active" ||
					subscription?.status === "scheduled",
			);
		if (
			(selection[`entity_${index}`] ?? 0) < 0.7 &&
			!retainExistingSubscriptions
		)
			return;
		const request = { customer_id, entity_id: entity.id };
		entityReads.set(JSON.stringify(request), request);
	});
	for (const item of pending) {
		if (item.name !== "updateSubscription") continue;
		const request = item.args.request as Record<string, unknown> | undefined;
		if (
			typeof request?.customer_id !== "string" ||
			typeof request.entity_id !== "string"
		)
			continue;
		const target = {
			customer_id: request.customer_id,
			entity_id: request.entity_id,
		};
		entityReads.set(JSON.stringify(target), target);
	}
	await Promise.all(
		[...entityReads.values()].map(async (request) => {
			const result = await read("getEntity", request);
			evidence.details.push({ name: "getEntity", args: { request }, result });
		}),
	);
	const hasActiveSubscription = evidence.details.some((detail) => {
		if (detail.name !== "getCustomer" && detail.name !== "getEntity")
			return false;
		const subscriptions = (detail.result as { subscriptions?: unknown } | null)
			?.subscriptions;
		return (
			Array.isArray(subscriptions) &&
			subscriptions.some((subscription) => subscription?.status === "active")
		);
	});
	const retainSubscriptionUpdate =
		hasActiveSubscription && (selection.mutation_requested ?? 0) >= 0.5;
	const operations = candidates.filter(
		(tool) =>
			(selection[`operation_${tool.name}`] ?? 0) >= 0.2 ||
			(tool.name === "updateSubscription" && retainSubscriptionUpdate),
	);
	const selectedSkills = leafSkillBundle(
		skills
			.filter((_skill, index) => (selection[`skill_${index}`] ?? 0) >= 0.5)
			.map((skill) => skill.name),
	).filter((skill) => skill.name !== "autumn-billing");
	return {
		evidence,
		operations: operations.map((tool) => tool.name),
		selection,
		markdown: [
			"Current authoritative read results follow. Reuse these reads. context_truncated means the list is incomplete; do not infer absence from it. Resolve missing or ambiguous targets before proposing writes. Operation candidates are capabilities, not authorization. Honor explicit customer-level scope. Preparation performed no writes.",
			JSON.stringify(context),
			JSON.stringify({ operationCandidates: operations }),
			"Clarification flags score missing user decisions, not authorization. A score >= 0.5 requires asking for that decision before previewing or proposing the affected billing action.",
			JSON.stringify({
				clarificationFlags: Object.fromEntries(
					Object.entries(clarificationQuestions).map(([name, description]) => [
						name,
						{ score: selection[name] ?? 0, description },
					]),
				),
			}),
			...selectedSkills.map(skillToText),
		].join("\n\n"),
	};
};
