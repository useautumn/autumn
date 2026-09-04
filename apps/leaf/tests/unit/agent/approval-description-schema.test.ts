import { expect, test } from "bun:test";
import { leafSkills, skillToText } from "@autumn/agent-docs/agent";
import { withApprovalDescriptionSchema } from "../../../agent/lib/approvalDescriptionSchema.js";

test("requires an agent-authored description on Leaf gated writes", () => {
	const schema = withApprovalDescriptionSchema({
		additionalProperties: false,
		properties: { request: { type: "object" } },
		required: ["request"],
		type: "object",
	});

	expect(schema.required).toEqual(["request", "approval_description"]);
	expect(schema.properties).toMatchObject({
		approval_description: { minLength: 1, type: "string" },
		request: { type: "object" },
	});
});

// The field's guidance rides on the tool schema, not the prompt, so it reaches
// the agent on every gated write without any instructions file carrying it.
test("the schema itself tells the agent what to write", () => {
	const { approval_description: field } = withApprovalDescriptionSchema({
		type: "object",
	}).properties as Record<string, { description: string }>;

	expect(field.description).toContain("walkthrough");
	expect(field.description).toContain("bullet per change");
});

test("the billing playbook carries the billing params", () => {
	const billingSkill = leafSkills.find(
		(skill) => skill.name === "autumn-billing",
	);
	expect(billingSkill && skillToText(billingSkill)).toContain("invoice mode");
});
