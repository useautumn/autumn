import { describe, expect, test } from "bun:test";
import { approvalSets } from "../../../agent/lib/approvalSets.js";
import { GATED_WRITES } from "../../../agent/lib/gatedWrites.js";
import { approvalScopeRequirements } from "../../../src/internal/approvals/utils/approvalScopeRequirements.js";
import { writeToPreviewTool } from "../../../src/internal/approvals/utils/toolRegistry.js";

/** Locks the derived registries to the exact pre-consolidation literals so the
 * single-table refactor provably changed no behavior. */
describe("gated-write registry derivations", () => {
	test("per-agent approval sets match the pre-consolidation split", () => {
		expect([...approvalSets.billing].sort()).toEqual([
			"attach",
			"createBalance",
			"createEntity",
			"createReward",
			"createSchedule",
			"updateCustomer",
			"updateSubscription",
		]);
		expect([...approvalSets.catalog].sort()).toEqual([
			"createPlan",
			"createReward",
			"updateCatalog",
			"updatePlan",
		]);
		expect([...approvalSets.investigator]).toEqual([]);
		expect([...approvalSets.orchestrator].sort()).toEqual(["updateAgentRules"]);
	});

	test("scope requirements match the pre-consolidation record", () => {
		expect(approvalScopeRequirements).toEqual({
			attach: ["billing:write"],
			createBalance: ["balances:write"],
			createPlan: ["plans:write"],
			createReward: ["rewards:write"],
			createSchedule: ["billing:write"],
			updateCatalog: { ALL: ["plans:write", "features:write"] },
			updateCustomer: ["customers:write"],
			updatePlan: ["plans:write"],
			updateSubscription: ["billing:write"],
		});
	});

	test("write→preview mapping matches the pre-consolidation record", () => {
		const mapping = Object.fromEntries(
			GATED_WRITES.map((write) => [
				write.toolName,
				writeToPreviewTool(write.toolName),
			]),
		);
		expect(mapping).toEqual({
			attach: "previewAttach",
			createBalance: "previewCreateBalance",
			createEntity: undefined,
			createPlan: "previewUpdateCatalog",
			createReward: undefined,
			createSchedule: "previewCreateSchedule",
			updateAgentRules: undefined,
			updateCatalog: "previewUpdateCatalog",
			updateCustomer: undefined,
			updatePlan: "previewUpdateCatalog",
			updateSubscription: "previewUpdateSubscription",
		});
	});

	test("every gated write is exposed by at least one agent", () => {
		for (const write of GATED_WRITES) {
			expect(write.agents.length).toBeGreaterThan(0);
		}
	});
});
