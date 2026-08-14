import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import {
	catalogDecisionCard,
	parseCatalogDecisionButtonPayload,
	parseQuestionButtonPayload,
	questionCard,
} from "../../../src/providers/slack/presenters/interactionCards.js";

type CardButton = { id: string; value?: string };

const collectButtons = (card: unknown): CardButton[] => {
	const buttons: CardButton[] = [];
	const walk = (node: unknown) => {
		if (Array.isArray(node)) {
			for (const child of node) walk(child);
			return;
		}
		if (!node || typeof node !== "object") return;
		const record = node as Record<string, unknown>;
		if (record.type === "button" && typeof record.id === "string") {
			buttons.push({
				id: record.id,
				value: typeof record.value === "string" ? record.value : undefined,
			});
		}
		if (record.children) walk(record.children);
	};
	walk((card as { children: unknown }).children);
	return buttons;
};

const collectActionIds = (card: unknown) =>
	collectButtons(card).map((button) => button.id);

const questionPayload = {
	e: AppEnv.Sandbox,
	g: "org_1",
	l: "Custom base price",
	o: "price",
	q: "Which price?",
	r: "req_1",
	s: "wrun_1",
};

const catalogPayload = {
	e: AppEnv.Sandbox,
	g: "org_1",
	l: "Create new version",
	m: 0 as const,
	p: "pro",
	pv: [] as string[],
	v: "create_version",
};

const createQuestionCard = () =>
	questionCard({
		env: questionPayload.e,
		options: [{ id: questionPayload.o, label: questionPayload.l }],
		orgId: questionPayload.g,
		prompt: questionPayload.q,
		requestId: questionPayload.r,
		sessionId: questionPayload.s,
	});

const createCatalogDecisionCard = () =>
	catalogDecisionCard({
		env: AppEnv.Sandbox,
		model: {
			defaultVersioning: "create_version",
			metadataOnly: false,
			migration: { available: true, description: "d", label: "l" },
			needsDecision: true,
			planId: "pro",
			planName: "Pro",
			variants: [],
			versioningOptions: [
				{
					description: "d",
					label: "Create new version",
					value: "create_version",
				},
				{
					description: "d",
					label: "Update current version",
					value: "update_current",
				},
				{
					description: "d",
					label: "Update all versions",
					value: "update_all_versions",
				},
			],
		},
		orgId: "org_1",
		plan: {
			customer_count: 3,
			customize: { price: { amount: 120 } },
			has_customers: true,
			item_changes: [],
			other_versions: [{ has_customers: false, version: 1 }],
			plan_id: "pro",
			previous_attributes: null,
			variants: [],
			versionable: true,
		} as never,
	});

describe("eve interaction cards", () => {
	test("question option buttons carry unique action ids", () => {
		const card = questionCard({
			env: AppEnv.Sandbox,
			options: [
				{ id: "price", label: "Custom base price: $1,000/month" },
				{ id: "quantity", label: "1,000 credits/month quantity" },
			],
			orgId: "org_1",
			prompt: '"1k/mo" for Enterprise — which do you mean?',
			requestId: "req_1",
			sessionId: "wrun_1",
		});
		const ids = collectActionIds(card);
		expect(ids.length).toBe(2);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) expect(id).toMatch(/^answer_agent_question_\d+$/);
	});

	test("long option labels are truncated to Slack's 75-char cap", () => {
		const card = questionCard({
			env: AppEnv.Sandbox,
			options: [{ id: "a", label: "x".repeat(120) }],
			orgId: "org_1",
			prompt: "Pick",
			requestId: "req_1",
			sessionId: "wrun_1",
		});
		const json = JSON.stringify(card);
		const label = JSON.parse(json)
			.children.flatMap(
				(child: { children?: { label?: string }[] }) => child.children ?? [],
			)
			.find((element: { label?: string }) => element.label)?.label as string;
		expect(label.length).toBeLessThanOrEqual(75);
	});

	test("catalog decision buttons carry unique action ids", () => {
		const card = createCatalogDecisionCard();
		const ids = collectActionIds(card);
		expect(ids.length).toBe(4);
		expect(new Set(ids).size).toBe(ids.length);
	});

	test("button payloads round-trip through the interaction parsers", () => {
		const questionValue = collectButtons(createQuestionCard())[0]?.value;
		expect(parseQuestionButtonPayload(questionValue)).toEqual(questionPayload);

		const catalogValue = collectButtons(createCatalogDecisionCard())[0]?.value;
		expect(parseCatalogDecisionButtonPayload(catalogValue)).toEqual(
			catalogPayload,
		);
	});

	test("interaction parsers reject malformed or tampered values", () => {
		const invalid = [
			[parseQuestionButtonPayload, undefined],
			[parseQuestionButtonPayload, "{"],
			[
				parseQuestionButtonPayload,
				JSON.stringify({ ...questionPayload, e: "invalid" }),
			],
			[
				parseCatalogDecisionButtonPayload,
				JSON.stringify({ ...catalogPayload, m: true }),
			],
			[
				parseCatalogDecisionButtonPayload,
				JSON.stringify({ ...catalogPayload, extra: true }),
			],
		] as const;

		for (const [parse, value] of invalid) expect(parse(value)).toBeNull();
	});
});
