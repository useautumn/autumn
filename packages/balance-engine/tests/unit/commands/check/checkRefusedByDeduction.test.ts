import { describe, expect, test } from "bun:test";
import {
	CusProductStatus,
	FeatureType,
	FeatureUsageType,
	ResetInterval,
} from "@autumn/shared";
import type {
	Catalog,
	CheckCommand,
	CommandOrg,
	SubjectState,
	TrackCommand,
	WorkerCustomerEntitlement,
} from "../../../../src/balanceEngine.js";
import {
	applyMutation,
	checkRefusedByDeduction,
	computeCheck,
	createSubjectState,
	deductTrack,
	subjectStateToFullSubject,
	trackOutcomeToMutation,
} from "../../../../src/balanceEngine.js";
import { checkCommandToDeductionRequest } from "../../../../src/commands/check/checkCommandToDeductionRequest.js";
import { deductionContextFor } from "../../../../src/deduction/setup/deductionContextFor.js";
import { customerWith } from "../../deduction/deductionFixtures.js";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	createTrackCommand,
	identity,
	occurredAt,
	org,
} from "../../engineFixtures.js";

/** A deduction refused a check exactly when a check on the subject before it passes and on the subject after it does not. */

type Scenario = {
	messagesBalance: number | null;
	creditsBalance: number | null;
	value: number;
	overageBehavior: "cap" | "reject" | "overflow";
	usageAllowed: boolean;
	unlimited: boolean;
	allocated: boolean;
	rollover: boolean;
	dailyCap: boolean;
	pastDue: boolean;
	blocksOverdue: boolean;
};

const stateFor = ({ scenario }: { scenario: Scenario }): SubjectState => {
	const rows: WorkerCustomerEntitlement[] = [];
	if (scenario.messagesBalance !== null)
		rows.push({
			...createCustomerEntitlement({ balance: scenario.messagesBalance }),
			usage_allowed: scenario.usageAllowed,
			unlimited: scenario.unlimited,
		});
	if (scenario.creditsBalance !== null)
		rows.push(
			createCustomerEntitlement({
				id: "credits_row",
				featureId: "credits",
				balance: scenario.creditsBalance,
			}),
		);
	return createSubjectState({
		identity,
		customer: customerWith(
			scenario.dailyCap
				? {
						usage_limits: [
							{
								feature_id: "messages",
								enabled: true,
								limit: 5,
								interval: ResetInterval.Day,
							},
						],
					}
				: {},
		),
		customerProducts: [
			createCustomerProduct({
				status: scenario.pastDue
					? CusProductStatus.PastDue
					: CusProductStatus.Active,
			}),
		],
		customerEntitlements: rows,
		rollovers:
			scenario.rollover && scenario.messagesBalance !== null
				? [
						{
							id: "ro_1",
							cus_ent_id: "messages_monthly",
							balance: 2,
							usage: 0,
							expires_at: occurredAt + 1000,
							entities: {},
						},
					]
				: [],
	});
};

const catalogFor = ({
	state,
	scenario,
}: {
	state: SubjectState;
	scenario: Scenario;
}): Catalog => {
	const catalog = createCatalogFor({ state });
	const messages = catalog.features.feat_messages;
	if (messages && scenario.allocated)
		messages.config = { usage_type: FeatureUsageType.Continuous };
	const credits = catalog.features.feat_credits;
	if (credits) {
		credits.type = FeatureType.CreditSystem;
		credits.config = {
			schema: [
				{ metered_feature_id: "messages", feature_amount: 1, credit_amount: 2 },
			],
		};
	}
	return catalog;
};

const checkOn = ({
	track,
	featureId,
}: {
	track: TrackCommand;
	featureId: string;
}): CheckCommand => ({
	schemaVersion: 1,
	type: "check",
	requestId: track.commandId,
	identity: track.identity,
	occurredAt: track.occurredAt,
	org: track.org,
	featureId,
	internalFeatureId: `feat_${featureId}`,
	requiredBalance: 0.0000001,
	properties: track.properties,
});

const decide = ({ scenario }: { scenario: Scenario }) => {
	const state = stateFor({ scenario });
	const catalog = catalogFor({ state, scenario });
	const before = subjectStateToFullSubject({ state, catalog });
	const commandOrg: CommandOrg = {
		...org,
		config: {
			...org.config,
			block_overdue_entitlements: scenario.blocksOverdue,
		},
	};
	const track = {
		...createTrackCommand({
			value: scenario.value,
			overageBehavior: scenario.overageBehavior,
		}),
		org: commandOrg,
	};
	const deduction = deductTrack({ fullSubject: before, command: track });
	const mutation = trackOutcomeToMutation({
		command: track,
		outcome: deduction,
		fullSubject: before,
	});
	const after = subjectStateToFullSubject({
		state: applyMutation({ state, mutation }),
		catalog,
	});
	return { track, before, after, deduction };
};

/** A result, or the error it threw: both sides must agree on either. */
const answerOf = <Result>(run: () => Result): Result | string => {
	try {
		return run();
	} catch (error) {
		return error instanceof Error ? error.name : "unknown";
	}
};

const scenariosOf = (): Scenario[] => {
	const scenarios: Scenario[] = [];
	for (const messagesBalance of [null, 0, 0.5, 3, 100])
		for (const creditsBalance of [null, 0, 100])
			for (const value of [0.5, 3, 10])
				for (const overageBehavior of ["cap", "reject", "overflow"] as const)
					for (const usageAllowed of [false, true])
						for (const unlimited of [false, true])
							for (const allocated of [false, true])
								for (const rollover of [false, true])
									for (const dailyCap of [false, true])
										for (const [pastDue, blocksOverdue] of [
											[false, false],
											[true, false],
											[true, true],
										] as const) {
											if (messagesBalance === null && creditsBalance === null)
												continue;
											if (messagesBalance === null && (unlimited || allocated))
												continue;
											scenarios.push({
												messagesBalance,
												creditsBalance,
												value,
												overageBehavior,
												usageAllowed,
												unlimited,
												allocated,
												rollover,
												dailyCap,
												pastDue,
												blocksOverdue,
											});
										}
	return scenarios;
};

describe("the check a deduction refused", () => {
	test("is what the checks on the subject before and after the deduction say", () => {
		let compared = 0;
		let refused = 0;
		for (const scenario of scenariosOf()) {
			const decided = answerOf(() => decide({ scenario }));
			if (typeof decided === "string") continue;
			const { track, before, after, deduction } = decided;
			for (const featureId of ["messages", "credits"]) {
				const command = checkOn({ track, featureId });
				const fromDeduction = answerOf(() =>
					checkRefusedByDeduction({ fullSubject: before, command, deduction }),
				);
				const fromSubjects = answerOf(() => {
					const wasAllowed = computeCheck({ fullSubject: before, command });
					const now = computeCheck({ fullSubject: after, command });
					return wasAllowed.allowed && !now.allowed ? now : null;
				});
				if (JSON.stringify(fromDeduction) !== JSON.stringify(fromSubjects))
					throw new Error(
						`Diverged on ${featureId} for ${JSON.stringify(scenario)}: ${JSON.stringify({ fromDeduction, fromSubjects })}`,
					);
				compared += 1;
				if (fromSubjects !== null && typeof fromSubjects !== "string")
					refused += 1;
			}
		}
		expect(compared).toBeGreaterThan(5_000);
		expect(refused).toBeGreaterThan(100);
	}, 60_000);

	const plain: Scenario = {
		messagesBalance: 100,
		creditsBalance: null,
		value: 3,
		overageBehavior: "cap",
		usageAllowed: false,
		unlimited: false,
		allocated: false,
		rollover: false,
		dailyCap: false,
		pastDue: false,
		blocksOverdue: false,
	};

	const reusesTheDeductionsRows = ({ scenario }: { scenario: Scenario }) => {
		const { track, before, deduction } = decide({ scenario });
		const request = checkCommandToDeductionRequest({
			command: checkOn({ track, featureId: "messages" }),
		});
		const context = deductionContextFor({
			fullSubject: before,
			request,
			reusing: deduction,
		});
		return context.rows === deduction.context.rows;
	};

	test("reuses the deduction's rows when the check would set them up the same way", () => {
		expect(reusesTheDeductionsRows({ scenario: plain })).toBe(true);
		expect(
			reusesTheDeductionsRows({
				scenario: { ...plain, overageBehavior: "overflow" },
			}),
		).toBe(true);
	});

	test("sets up its own rows when the overdue rule or a free allocated row would change them", () => {
		expect(
			reusesTheDeductionsRows({
				scenario: { ...plain, pastDue: true, blocksOverdue: true },
			}),
		).toBe(false);
		expect(
			reusesTheDeductionsRows({ scenario: { ...plain, allocated: true } }),
		).toBe(false);
	});
});
