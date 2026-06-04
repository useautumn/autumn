import { expect, test } from "bun:test";
import { addMonths, parseISO } from "date-fns";
import {
	expectExactApiCall,
	expectNoApiCall,
	expectNoToolCall,
	expectToolCall,
	initMcpEval,
	type ToolRequestInput,
} from "../utils/eval-test-utils.js";

const today = parseISO("2026-01-15T00:00:00.000Z");
const expectedGrant = {
	customer_id: "cus_687672c4c0d36fa5679f8c7a",
	entity_id: "ent_689d243e2c03da31e0ac90d0",
	feature_id: "credits",
	included_grant: 50000,
	expires_at: addMonths(today, 2).getTime(),
} satisfies ToolRequestInput<"createBalance">;

test("previews and creates an entity-scoped expiring credit grant", async () => {
	const { api, approve, generate, toolCalls } = initMcpEval({
		today,
		fixtures: {
			getCustomer: {
				id: expectedGrant.customer_id,
				entities: [
					{
						id: expectedGrant.entity_id,
						name: "Contract workspace",
					},
				],
				balances: {},
			},
			listPlans: {
				list: [
					{
						id: "team",
						name: "Team",
						items: [{ feature_id: "credits", feature_type: "metered" }],
					},
				],
			},
			createBalance: { success: true },
		},
	});

	await generate(
		[
			"Looking to give entity ent_689d243e2c03da31e0ac90d0 on customer cus_687672c4c0d36fa5679f8c7a 50k credits on the credits feature that expire in 2 months. Can you set that up in Autumn?",
			"These should not be permanent credits.",
		],
		6,
	);

	expectToolCall(toolCalls, "previewCreateBalance", expectedGrant);
	expectNoApiCall(api, "createBalance");

	await approve("Looks good, apply that exact credit grant.");

	expectToolCall(toolCalls, "createBalance", expectedGrant);
	expectExactApiCall(api, "createBalance", expectedGrant);
	expectNoToolCall(toolCalls, "attach");
	expectNoToolCall(toolCalls, "updateSubscription");
	expectNoToolCall(toolCalls, "createSchedule");
	expect(api.call("createBalance")?.rawBody).not.toHaveProperty("reset");
	expect(api.call("createBalance")?.rawBody).not.toHaveProperty(
		"granted_balance",
	);
}, 45000);
