import { expect, test } from "bun:test";
import {
	leafAgentPrompt,
	leafSkills,
	skillToText,
} from "@autumn/agent-docs/agent";
import { withApprovalSummarySchema } from "../../../agent/lib/approvalSummarySchema.js";

test("requires an agent-authored summary on Leaf billing writes", () => {
	const schema = withApprovalSummarySchema({
		additionalProperties: false,
		properties: { request: { type: "object" } },
		required: ["request"],
		type: "object",
	});

	expect(schema.required).toEqual(["request", "approval_summary"]);
	expect(schema.properties).toMatchObject({
		approval_summary: { maxLength: 600, minLength: 1, type: "string" },
		request: { type: "object" },
	});
});

test("gives the billing agent its summary guidance with the billing playbook", () => {
	const prompt = leafAgentPrompt("billing");
	const orchestratorPrompt = leafAgentPrompt("orchestrator");
	const billingSkill = leafSkills.find(
		(skill) => skill.name === "autumn-billing",
	);

	expect(prompt).toContain("approval_summary");
	expect(prompt).toContain(
		"autumn-billing` knowledge is already in this prompt",
	);
	expect(orchestratorPrompt).toContain('saying "stop" does not change this');
	expect(billingSkill && skillToText(billingSkill)).toContain("invoice_mode");
});
