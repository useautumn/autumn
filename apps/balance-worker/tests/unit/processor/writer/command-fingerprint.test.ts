import { describe, expect, test } from "bun:test";
import {
	type ApplyBillingPlanCommand,
	parseTrackCommand,
} from "@autumn/balance-engine";
import { commandToFingerprint } from "../../../../src/processor/writer/receipt/commandToFingerprint.js";
import {
	createCustomerEntitlement,
	createTrackCommand,
	testIdentity,
	testOccurredAt,
} from "../../../fixtures/mutations.js";

const planCommand = ({
	intent,
}: {
	intent?: ApplyBillingPlanCommand["intent"];
}): ApplyBillingPlanCommand => ({
	schemaVersion: 1,
	type: "applyBillingPlan",
	commandId: "plan_1",
	requestId: "req_plan_1",
	identity: testIdentity,
	occurredAt: testOccurredAt,
	entityIds: [],
	ops: [
		{
			op: "insert",
			table: "customerEntitlements",
			row: createCustomerEntitlement(),
		},
	],
	expiringPooledBalanceIds: [],
	...(intent ? { intent } : {}),
});

describe("command fingerprint", () => {
	test("who asked is not part of the request a retry must repeat", () => {
		const bare = createTrackCommand();
		const named = parseTrackCommand({
			input: { ...bare, actor: { type: "dashboard", id: "user_1" } },
		});

		expect(commandToFingerprint({ command: named })).toBe(
			commandToFingerprint({ command: bare }),
		);
	});

	test("why a plan was applied is not part of the request either", () => {
		const bare = planCommand({});
		const explained = planCommand({
			intent: {
				action: "upgrade",
				fromPlanIds: ["pro"],
				toPlanIds: ["premium"],
			},
		});

		expect(commandToFingerprint({ command: explained })).toBe(
			commandToFingerprint({ command: bare }),
		);
	});
});
