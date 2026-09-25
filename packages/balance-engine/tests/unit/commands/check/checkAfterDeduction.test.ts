import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	FeatureUsageType,
	ResetInterval,
} from "@autumn/shared";
import {
	applyMutation,
	type Catalog,
	checkAfterDeduction,
	computeCheck,
	computeTrackDecision,
	createSubjectState,
	type SubjectState,
	subjectStateToFullSubject,
	type TrackCommand,
} from "../../../../src/balanceEngine.js";
import type { CommandOrg } from "../../../../src/models/command/commandOrg.js";
import { customerWith } from "../../deduction/deductionFixtures.js";
import {
	createCatalogFor,
	createCheckCommand,
	createCustomerEntitlement,
	createCustomerProduct,
	createTrackCommand,
	identity,
	org,
} from "../../engineFixtures.js";

/** A check after a track, drawn from the track's outcome, says what a check on the applied state says. */

const A_HAIR = 0.0000001;

const stateWith = ({
	balance = 10,
	customer,
	status = CusProductStatus.Active,
}: {
	balance?: number;
	customer?: Parameters<typeof createSubjectState>[0]["customer"];
	status?: CusProductStatus;
} = {}) =>
	createSubjectState({
		identity,
		customer,
		customerProducts: [createCustomerProduct({ status })],
		customerEntitlements: [createCustomerEntitlement({ balance })],
	});

/** Runs the track, then the check both ways: on the outcome, and on the subject rebuilt after the mutation. */
const trackThenCheck = ({
	state,
	catalog = createCatalogFor({ state }),
	track,
	requiredBalance = A_HAIR,
	checkOrg,
}: {
	state: SubjectState;
	catalog?: Catalog;
	track: Partial<TrackCommand>;
	requiredBalance?: number;
	checkOrg?: CommandOrg;
}) => {
	const subjectOf = (subjectState: SubjectState) =>
		subjectStateToFullSubject({ state: subjectState, catalog });
	const before = subjectOf(state);
	const command = {
		...createTrackCommand({ overageBehavior: "cap" }),
		...track,
	};
	const { mutation, outcome } = computeTrackDecision({
		fullSubject: before,
		command,
	});
	const after = subjectOf(applyMutation({ state, mutation }));
	const checkCommand = {
		...createCheckCommand({ requiredBalance }),
		org: checkOrg ?? command.org,
	};
	return {
		reused: checkAfterDeduction({
			fullSubject: before,
			command: checkCommand,
			outcome,
		}),
		onBefore: computeCheck({ fullSubject: before, command: checkCommand }),
		onAfter: computeCheck({ fullSubject: after, command: checkCommand }),
	};
};

const expectSameAsRebuilt = ({
	reused,
	onBefore,
	onAfter,
}: ReturnType<typeof trackThenCheck>) => {
	expect(reused.after).toEqual(onAfter);
	expect(reused.before()).toEqual(onBefore);
};

describe("checkAfterDeduction", () => {
	test.concurrent("a track that leaves balance reads allowed", () => {
		const run = trackThenCheck({ state: stateWith(), track: { value: 3 } });
		expectSameAsRebuilt(run);
		expect(run.reused.after.allowed).toBe(true);
	});

	test.concurrent(
		"a track that empties the allowance reads refused after, allowed before",
		() => {
			const run = trackThenCheck({ state: stateWith(), track: { value: 10 } });
			expectSameAsRebuilt(run);
			expect(run.reused.after).toMatchObject({
				allowed: false,
				limitType: "included",
			});
			expect(run.reused.before().allowed).toBe(true);
		},
	);

	test.concurrent("a refused track left nothing behind", () => {
		const run = trackThenCheck({
			state: stateWith({ balance: 3 }),
			track: { value: 5, overageBehavior: "reject" },
		});
		expectSameAsRebuilt(run);
		expect(run.reused.after.allowed).toBe(true);
	});

	test.concurrent("a refund is drawn on top of like a deduction", () => {
		const run = trackThenCheck({
			state: stateWith({ balance: 0 }),
			track: { value: -4 },
		});
		expectSameAsRebuilt(run);
		expect(run.reused.after.allowed).toBe(true);
	});

	test.concurrent(
		"an overflow track's context serves the check, which still rejects on its own terms",
		() => {
			const run = trackThenCheck({
				state: stateWith({ balance: 10 }),
				track: { value: 15, overageBehavior: "overflow" },
			});
			expectSameAsRebuilt(run);
			expect(run.reused.after.allowed).toBe(false);
		},
	);

	test.concurrent("the answer is denominated in the check's own draw", () => {
		const run = trackThenCheck({
			state: stateWith(),
			track: { value: 3 },
			requiredBalance: 4,
		});
		expectSameAsRebuilt(run);
		expect(run.reused.after.requiredBalance).toBe(4);
	});

	test.concurrent(
		"a track that spends a daily cap reads the cap as reached",
		() => {
			const state = stateWith({
				balance: 100,
				customer: customerWith({
					usage_limits: [
						{
							feature_id: "messages",
							enabled: true,
							limit: 5,
							interval: ResetInterval.Day,
						},
					],
				}),
			});
			const run = trackThenCheck({ state, track: { value: 5 } });
			expectSameAsRebuilt(run);
			expect(run.reused.after).toMatchObject({
				allowed: false,
				limitType: "usage_limit",
			});
		},
	);

	test.concurrent(
		"a free allocated row ran over under cap; the check sets up its own rows and refuses",
		() => {
			const state = stateWith({ balance: 10 });
			const catalog = createCatalogFor({ state });
			const feature = catalog.features.feat_messages;
			if (!feature) throw new Error("fixture feature missing");
			feature.config = { usage_type: FeatureUsageType.Continuous };
			const run = trackThenCheck({ state, catalog, track: { value: 15 } });
			expectSameAsRebuilt(run);
			expect(run.reused.after.allowed).toBe(false);
		},
	);

	test.concurrent(
		"a past-due plan funded the track; the check honours the org's block on its own rows",
		() => {
			const blocking: CommandOrg = {
				config: { ...org.config, block_overdue_entitlements: true },
			};
			const run = trackThenCheck({
				state: stateWith({ status: CusProductStatus.PastDue }),
				track: { value: 3, org: blocking },
			});
			expectSameAsRebuilt(run);
			expect(run.reused.after.allowed).toBe(false);
			expect(run.reused.before().allowed).toBe(false);
		},
	);
});
