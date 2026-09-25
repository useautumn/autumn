import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	type Catalog,
	type CommandOrg,
	createSubjectState,
	deductTrack,
	type SubjectState,
	subjectStateToFullSubject,
	trackOutcomeToMutation,
	type WorkerCustomerEntitlement,
} from "@autumn/balance-engine";
import {
	CusProductStatus,
	type DbUsageAlert,
	FeatureType,
	ResetInterval,
} from "@autumn/shared";
import { customerWith } from "../../../balance-engine/tests/unit/deduction/deductionFixtures.js";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	createTrackCommand,
	identity,
	occurredAt,
	org,
} from "../../../balance-engine/tests/unit/engineFixtures.js";
import { subjectsToBalanceWebhooks } from "../../src/balanceWebhooks.js";
import { mayFireBalanceWebhooks } from "../../src/common/classifyDeduction/mayFireBalanceWebhooks.js";

/** Handing over the deduction may only skip work: the webhooks must be exactly the full checks' answer. */

type Scenario = {
	messagesBalance: number | null;
	creditsBalance: number | null;
	value: number;
	overageBehavior: "cap" | "reject" | "overflow";
	usageAllowed: boolean;
	unlimitedMessages: boolean;
	rollover: boolean;
	dailyCap: boolean;
	pastDueBlocked: boolean;
	alerts: "none" | "customer" | "org" | "disabled";
};

const alertOn = ({
	enabled = true,
}: {
	enabled?: boolean;
} = {}): DbUsageAlert => ({
	feature_id: "messages",
	enabled,
	threshold: 80,
	threshold_type: "usage_percentage",
	basis: "balance",
});

const orgFor = ({ scenario }: { scenario: Scenario }): CommandOrg => ({
	...org,
	config: {
		...org.config,
		block_overdue_entitlements: scenario.pastDueBlocked,
		...(scenario.alerts === "org" ? { sandbox_usage_alerts: [alertOn()] } : {}),
	},
});

const stateFor = ({ scenario }: { scenario: Scenario }): SubjectState => {
	const rows: WorkerCustomerEntitlement[] = [];
	if (scenario.messagesBalance !== null)
		rows.push({
			...createCustomerEntitlement({ balance: scenario.messagesBalance }),
			usage_allowed: scenario.usageAllowed,
			unlimited: scenario.unlimitedMessages,
		});
	if (scenario.creditsBalance !== null)
		rows.push(
			createCustomerEntitlement({
				id: "credits_row",
				featureId: "credits",
				balance: scenario.creditsBalance,
			}),
		);
	const alerts =
		scenario.alerts === "customer"
			? [alertOn()]
			: scenario.alerts === "disabled"
				? [alertOn({ enabled: false })]
				: [];
	return createSubjectState({
		identity,
		customer: {
			...customerWith(
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
			usage_alerts: alerts,
		},
		customerProducts: [
			createCustomerProduct({
				status: scenario.pastDueBlocked
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

const catalogFor = ({ state }: { state: SubjectState }): Catalog => {
	const catalog = createCatalogFor({ state });
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

const decide = ({ scenario }: { scenario: Scenario }) => {
	const state = stateFor({ scenario });
	const catalog = catalogFor({ state });
	const before = subjectStateToFullSubject({ state, catalog });
	const command = {
		...createTrackCommand({
			value: scenario.value,
			overageBehavior: scenario.overageBehavior,
		}),
		org: orgFor({ scenario }),
	};
	const deduction = deductTrack({ fullSubject: before, command });
	const mutation = trackOutcomeToMutation({
		command,
		outcome: deduction,
		fullSubject: before,
	});
	const after = subjectStateToFullSubject({
		state: applyMutation({ state, mutation }),
		catalog,
	});
	return { mutation, before, after, deduction };
};

const scenariosOf = (): Scenario[] => {
	const scenarios: Scenario[] = [];
	for (const messagesBalance of [null, 0, 0.5, 3, 100])
		for (const creditsBalance of [null, 0, 100])
			for (const value of [0.5, 3, 10])
				for (const overageBehavior of ["cap", "reject", "overflow"] as const)
					for (const usageAllowed of [false, true])
						for (const unlimitedMessages of [false, true])
							for (const rollover of [false, true])
								for (const dailyCap of [false, true])
									for (const pastDueBlocked of [false, true])
										for (const alerts of [
											"none",
											"customer",
											"org",
											"disabled",
										] as const) {
											if (messagesBalance === null && creditsBalance === null)
												continue;
											if (messagesBalance === null && unlimitedMessages)
												continue;
											scenarios.push({
												messagesBalance,
												creditsBalance,
												value,
												overageBehavior,
												usageAllowed,
												unlimitedMessages,
												rollover,
												dailyCap,
												pastDueBlocked,
												alerts,
											});
										}
	return scenarios;
};

/** A scenario the engine refuses has no mutation to decide webhooks for. */
const tryDecide = ({ scenario }: { scenario: Scenario }) => {
	try {
		return decide({ scenario });
	} catch {
		return null;
	}
};

describe("webhooks with the deduction handed over", () => {
	test("match the full checks in every scenario, and skip them where nothing can fire", () => {
		let decided = 0;
		let skipped = 0;
		let fired = 0;
		for (const scenario of scenariosOf()) {
			const decision = tryDecide({ scenario });
			if (!decision) continue;
			decided += 1;
			const { mutation, before, after, deduction } = decision;
			const full = subjectsToBalanceWebhooks({ mutation, before, after });
			const handedOver = subjectsToBalanceWebhooks({
				mutation,
				before,
				after,
				deduction,
			});
			if (JSON.stringify(handedOver) !== JSON.stringify(full))
				throw new Error(
					`Webhooks diverged for ${JSON.stringify(scenario)}: ${JSON.stringify({ full, handedOver })}`,
				);
			if (full.length > 0) fired += 1;
			if (!mayFireBalanceWebhooks({ mutation, before, deduction }))
				skipped += 1;
		}
		expect(decided).toBeGreaterThan(5_000);
		expect(fired).toBeGreaterThan(50);
		expect(skipped).toBeGreaterThan(decided / 10);
	}, 30_000);

	test("a track that leaves plenty, with no alert configured, skips the checks", () => {
		const { mutation, before, deduction } = decide({
			scenario: {
				messagesBalance: 100,
				creditsBalance: null,
				value: 3,
				overageBehavior: "cap",
				usageAllowed: false,
				unlimitedMessages: false,
				rollover: false,
				dailyCap: false,
				pastDueBlocked: false,
				alerts: "none",
			},
		});
		expect(mayFireBalanceWebhooks({ mutation, before, deduction })).toBe(false);
	});

	test("a track that empties the allowance, or one an alert watches, runs the full checks", () => {
		const base: Scenario = {
			messagesBalance: 3,
			creditsBalance: null,
			value: 3,
			overageBehavior: "cap",
			usageAllowed: false,
			unlimitedMessages: false,
			rollover: false,
			dailyCap: false,
			pastDueBlocked: false,
			alerts: "none",
		};
		for (const scenario of [
			base,
			{ ...base, messagesBalance: 100, alerts: "customer" as const },
			{ ...base, messagesBalance: 100, dailyCap: true },
		]) {
			const { mutation, before, deduction } = decide({ scenario });
			expect(mayFireBalanceWebhooks({ mutation, before, deduction })).toBe(
				true,
			);
		}
	});
});
