import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { catalogDecisionCard, questionCard } from "../../../src/ui/eveCards.js";

const collectActionIds = (card: unknown): string[] => {
	const ids: string[] = [];
	const walk = (node: unknown) => {
		if (Array.isArray(node)) {
			for (const child of node) walk(child);
			return;
		}
		if (!node || typeof node !== "object") return;
		const record = node as Record<string, unknown>;
		if (record.type === "button" && typeof record.id === "string") {
			ids.push(record.id);
		}
		if (record.children) walk(record.children);
	};
	walk((card as { children: unknown }).children);
	return ids;
};

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
		const plan = {
			customer_count: 3,
			customize: { price: { amount: 120 } },
			has_customers: true,
			item_changes: [],
			other_versions: [{ has_customers: false, version: 1 }],
			plan_id: "pro",
			previous_attributes: null,
			variants: [],
			versionable: true,
		} as never;
		const card = catalogDecisionCard({
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
			plan,
		});
		const ids = collectActionIds(card);
		expect(ids.length).toBe(4);
		expect(new Set(ids).size).toBe(ids.length);
	});
});
