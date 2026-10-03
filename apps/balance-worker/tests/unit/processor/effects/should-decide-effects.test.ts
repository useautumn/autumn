import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeTrackDecision,
	createSubjectState,
	type SubjectState,
} from "@autumn/balance-engine";
import { decideEffects } from "../../../../src/processor/effects/decideEffects.js";
import {
	shouldDecideEffects,
	subjectAlwaysDecidesEffects,
} from "../../../../src/processor/effects/shouldDecideEffects.js";
import {
	createCustomerEntitlement,
	createCustomerProduct,
	createSubjectFor,
	createTrackCommand,
	testIdentity,
	testOrg,
} from "../../../fixtures/mutations.js";

/** A plain row, and optionally an overage row beside it that keeps the feature allowed below zero. */
const stateWith = ({
	balance,
	overageBalance,
}: {
	balance: number;
	overageBalance: number | null;
}): SubjectState =>
	createSubjectState({
		identity: testIdentity,
		customerProducts: [createCustomerProduct()],
		customerEntitlements: [
			createCustomerEntitlement({ id: "messages_row", balance }),
			...(overageBalance === null
				? []
				: [
						{
							...createCustomerEntitlement({
								id: "messages_overage_row",
								balance: overageBalance,
							}),
							usage_allowed: true,
						},
					]),
		],
	});

describe("should decide effects", () => {
	test("is true whenever the full effects would find any", () => {
		let checked = 0;
		for (const balance of [-2, 0, 1, 2, 3, 5])
			for (const overageBalance of [null, -1, 0, 1])
				for (const value of [-3, -1, 1, 2, 4, 9])
					for (const overageBehavior of [
						"reject",
						"cap",
						"overflow",
					] as const) {
						const state = stateWith({ balance, overageBalance });
						const before = createSubjectFor({ state });
						const command = createTrackCommand({ value, overageBehavior });
						const decision = computeTrackDecision({
							fullSubject: before,
							command,
						});
						const after = createSubjectFor({
							state: applyMutation({ state, mutation: decision.mutation }),
						});
						const effects = decideEffects({ decision, before, after });
						if (effects.length === 0) continue;
						checked++;
						expect(
							shouldDecideEffects({
								command,
								decision,
								alwaysDecides: subjectAlwaysDecidesEffects({
									fullSubject: before,
								}),
							}),
						).toBeTrue();
					}
		expect(checked).toBeGreaterThan(20);
	});

	test("a draw that leaves every row above zero is skipped unless the subject or org configures alerts or top-ups", () => {
		const state = stateWith({ balance: 50, overageBalance: 0 });
		const fullSubject = createSubjectFor({ state });
		const command = createTrackCommand({ value: 1, overageBehavior: "reject" });
		const decision = computeTrackDecision({ fullSubject, command });
		expect(
			shouldDecideEffects({ command, decision, alwaysDecides: false }),
		).toBeFalse();

		const alerted = createSubjectFor({
			state: {
				...state,
				customer: {
					...state.customer,
					usage_alerts: [
						{
							feature_id: "messages",
							threshold: 10,
							threshold_type: "usage",
							enabled: true,
						},
					],
				} as SubjectState["customer"],
			},
		});
		expect(subjectAlwaysDecidesEffects({ fullSubject: alerted })).toBeTrue();
		const orgAlerted = {
			...command,
			org: {
				...testOrg,
				config: {
					...testOrg.config,
					sandbox_usage_alerts: [
						{ threshold: 10, threshold_type: "usage", enabled: true },
					],
				},
			},
		} as typeof command;
		expect(
			shouldDecideEffects({
				command: orgAlerted,
				decision,
				alwaysDecides: false,
			}),
		).toBeTrue();
	});
});
