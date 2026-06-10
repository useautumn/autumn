import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const generatedRules = {
	entity_rules: { attach_to_entities: true, entity_feature_id: "deployments" },
	credit_rules: { credit_feature_id: "credits" },
	notes: "",
};

const mockState = {
	existingNotes: "",
	upsertCalls: [] as Record<string, unknown>[],
};

mock.module(
	"@/internal/agent/workflows/generateAgentRules/generateAgentRules.js",
	() => ({
		generateAgentRules: async () => ({
			rules: generatedRules,
			metadata: { generated_from: "axiom" },
			unconfigured: false,
		}),
	}),
);

mock.module("@/internal/agent/rules/repos/index.js", () => ({
	agentRulesRepo: {
		get: async () => ({
			entity_rules: { attach_to_entities: false, entity_feature_id: "" },
			credit_rules: { credit_feature_id: "" },
			notes: mockState.existingNotes,
			metadata: {},
			org_id: "org_test",
			org_slug: "test",
			updated_at: null,
		}),
		upsert: async (args: { rules: typeof generatedRules }) => {
			mockState.upsertCalls.push(args);
			return { ...args.rules, metadata: {}, org_id: "org_test" };
		},
	},
}));

const { generateAndUpdateAgentRules } = await import(
	"@/internal/agent/rules/actions/generateAndUpdateAgentRules.js"
);

const ctx = {
	db: {},
	org: { id: "org_test", slug: "test" },
} as unknown as AutumnContext;

describe("generateAndUpdateAgentRules", () => {
	beforeEach(() => {
		mockState.existingNotes = "";
		mockState.upsertCalls = [];
	});

	test("preserves existing user notes when applying generated rules", async () => {
		mockState.existingNotes = "Always attach add-ons at the customer level.";

		const result = await generateAndUpdateAgentRules({ ctx });

		expect(mockState.upsertCalls).toHaveLength(1);
		expect(mockState.upsertCalls[0]).toMatchObject({
			rules: {
				entity_rules: generatedRules.entity_rules,
				credit_rules: generatedRules.credit_rules,
				notes: "Always attach add-ons at the customer level.",
			},
		});
		expect(result.notes).toBe("Always attach add-ons at the customer level.");
	});

	test("keeps notes empty when none were saved", async () => {
		await generateAndUpdateAgentRules({ ctx });

		expect(mockState.upsertCalls[0]).toMatchObject({
			rules: { notes: "" },
		});
	});
});
