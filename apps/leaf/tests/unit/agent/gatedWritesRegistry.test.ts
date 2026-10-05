import { describe, expect, test } from "bun:test";
import { withApprovalDescriptionSchema } from "../../../agent/lib/approvalDescriptionSchema.js";
import { approvalSets } from "../../../agent/lib/approvalSets.js";
import { GATED_WRITES } from "../../../agent/lib/gatedWrites.js";
import { toolAllowlists } from "../../../agent/lib/toolAllowlists.js";
import { approvalScopeRequirements } from "../../../src/internal/approvals/utils/approvalScopeRequirements.js";
import { writeToPreviewTool } from "../../../src/internal/approvals/utils/toolRegistry.js";

/** Locks the derived registries to exact literals so the single-table registry
 * — and the flattening that repointed it at one agent — provably kept every
 * gate. The live agent must gate every write it can reach. */
describe("gated-write registry derivations", () => {
	test("the single agent gates every write the old split gated", () => {
		expect([...approvalSets.leaf].sort()).toEqual([
			"attach",
			"createBalance",
			"createEntity",
			"createInvoice",
			"createReward",
			"createSchedule",
			"finalizeInvoice",
			"issueCreditNote",
			"payInvoice",
			"reissueInvoice",
			"updateAgentRules",
			"updateCustomer",
			"updateSubscription",
			"voidInvoice",
		]);
		expect([...approvalSets.catalog].sort()).toEqual([
			"createPlan",
			"createReward",
			"updateCatalog",
			"updatePlan",
		]);
	});

	test("every write the live agent can call is approval-gated", () => {
		const ungated = toolAllowlists.leaf.filter(
			(tool) =>
				/^(attach|create|update|finalize|issue|pay|reissue|void)/.test(tool) &&
				!approvalSets.leaf.has(tool),
		);
		expect(ungated).toEqual([]);
	});

	test("scope requirements match the pre-consolidation record", () => {
		expect(approvalScopeRequirements).toEqual({
			attach: ["billing:write"],
			createBalance: ["balances:write"],
			createInvoice: ["billing:write"],
			createPlan: ["plans:write"],
			createReward: ["rewards:write"],
			createSchedule: ["billing:write"],
			finalizeInvoice: ["billing:write"],
			issueCreditNote: ["billing:write"],
			payInvoice: ["billing:write"],
			reissueInvoice: ["billing:write"],
			updateCatalog: { ALL: ["plans:write", "features:write"] },
			updateCustomer: ["customers:write"],
			updatePlan: ["plans:write"],
			updateSubscription: ["billing:write"],
			voidInvoice: ["billing:write"],
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
			createInvoice: "previewCreateInvoice",
			createPlan: "previewUpdateCatalog",
			createReward: undefined,
			createSchedule: "previewCreateSchedule",
			finalizeInvoice: "getInvoice",
			issueCreditNote: "previewIssueCreditNote",
			payInvoice: "getInvoice",
			reissueInvoice: "previewReissueInvoice",
			updateAgentRules: undefined,
			updateCatalog: "previewUpdateCatalog",
			updateCustomer: undefined,
			updatePlan: "previewUpdateCatalog",
			updateSubscription: "previewUpdateSubscription",
			voidInvoice: "getInvoice",
		});
	});

	test("every gated write is exposed by at least one agent", () => {
		for (const write of GATED_WRITES) {
			expect(write.agents.length).toBeGreaterThan(0);
		}
	});

	// Approval and explanation are one contract: the tool schema the agent sees
	// is built from the same flag, so a gated write cannot skip its summary.
	test("approval and summary duty cover exactly the same writes", () => {
		for (const write of GATED_WRITES) {
			expect(approvalSets.leaf.has(write.toolName)).toBe(
				write.agents.includes("leaf"),
			);
		}
		expect(
			withApprovalDescriptionSchema({ type: "object" }).required,
		).toContain("approval_description");
	});
});
