/**
 * Generated balance-preview cases (kind × prior usage × operation × timing × who scheduled it × scope),
 * each checked against the invariants in the balances audit rather than a hand-written answer.
 */
import { describe, expect, test } from "bun:test";
import { getApiBalances } from "@api/customers/cusFeatures";
import {
	CusProductStatus,
	type Entity,
	type FullCusProduct,
	type FullCustomer,
	ms,
	type SetPlansPreviewBalance,
	type SetPlansPreviewBalanceChange,
} from "@autumn/shared";
import { customers } from "@tests/utils/fixtures/db/customers";
import { entities } from "@tests/utils/fixtures/db/entities";
import chalk from "chalk";
import { buildSavedPhaseCustomers } from "@/internal/billing/v2/actions/setPlans/preview/balances/buildSavedPhaseCustomers";
import { customerToScopedBalances } from "@/internal/billing/v2/actions/setPlans/preview/balances/customerToScopedBalances";
import { savedComparisonCustomers } from "@/internal/billing/v2/actions/setPlans/preview/balances/savedComparisonCustomers";
import { buildSetPlansPhaseCustomers } from "@/internal/billing/v2/actions/setPlans/preview/buildSetPlansPhaseCustomers";
import { setPlansPhaseBalanceChanges } from "@/internal/billing/v2/actions/setPlans/preview/setPlansPhaseBalanceChanges";
import type { SchedulePhasePlan } from "@/internal/billing/v2/actions/setPlans/types/schedulePhasePlan";
import {
	makeAutumnBillingPlan,
	makeUpdate,
} from "../../billing-change-response/helpers/makeAutumnBillingPlan";
import {
	type BalanceFeatureId,
	type BalanceTimeline,
	balanceCtx,
	exactDateMatches,
	included,
	NOW,
	oneOffPrepaid,
	PHASE_TWO,
	payPerUse,
	planRow,
	previewBalanceChanges,
	type RowBalance,
} from "./balanceFixtures";
import {
	ctx,
	customerWithPools,
	describePooledPhases,
	entityA,
	entityB,
	entityRow,
	pooledCreditsPlan,
	RENEWAL,
	SUBSCRIBED_AT,
} from "./pooledCreditsFixtures";

const KINDS = ["included", "allocated", "payPerUse", "oneOffPrepaid"] as const;
const PRIORS = ["fresh", "partial", "overage"] as const;
const OPERATIONS = ["keep", "remove", "add", "switch", "customise"] as const;
const TIMINGS = ["immediate", "future"] as const;
const SCHEDULED_BY = ["request", "savedSchedule"] as const;
const SCOPES = ["customer", "entity"] as const;

type BalanceCase = {
	kind: (typeof KINDS)[number];
	prior: (typeof PRIORS)[number];
	operation: (typeof OPERATIONS)[number];
	timing: (typeof TIMINGS)[number];
	scheduledBy: (typeof SCHEDULED_BY)[number];
	scope: (typeof SCOPES)[number];
};

const QUANTITY = 10;
const ENTITY = entities.create({ id: "ent_a", featureId: "users" });

const FEATURE_BY_KIND: Record<BalanceCase["kind"], BalanceFeatureId> = {
	included: "words",
	allocated: "seats",
	payPerUse: "api_calls",
	oneOffPrepaid: "credits",
};

const usageFor = ({ prior }: BalanceCase) =>
	({ fresh: 0, partial: QUANTITY / 2, overage: QUANTITY + 2 })[prior];

const balanceFor = ({
	balanceCase,
	quantity,
	usage,
}: {
	balanceCase: BalanceCase;
	quantity: number;
	usage: number;
}): ((customerProductId: string) => RowBalance) => {
	const featureId = FEATURE_BY_KIND[balanceCase.kind];
	if (balanceCase.kind === "payPerUse") return payPerUse({ featureId, usage });
	if (balanceCase.kind === "oneOffPrepaid") {
		return oneOffPrepaid({ featureId, quantity, usage });
	}
	return included({ featureId, allowance: quantity, usage });
};

/** One-off credits can't go below zero; pay-per-use "overage" is simply more billable usage. */
const isMeaningful = ({
	kind,
	prior,
	operation,
	timing,
	scheduledBy,
}: BalanceCase) =>
	!(prior === "overage" && kind === "oneOffPrepaid") &&
	!(
		scheduledBy === "savedSchedule" &&
		(timing === "immediate" || operation === "keep")
	);

const buildTimeline = (balanceCase: BalanceCase): BalanceTimeline => {
	const { operation, timing, scheduledBy, scope } = balanceCase;
	const internalEntityId = scope === "entity" ? ENTITY.internal_id : undefined;
	const isFuture = timing === "future";
	const changeAt = isFuture ? PHASE_TWO : NOW;
	const savedEnd = scheduledBy === "savedSchedule" ? PHASE_TWO : undefined;

	const base = planRow({
		planId: "base",
		balances: [],
		isAddOn: true,
		internalEntityId,
	});
	const current = planRow({
		planId: "pro",
		endedAt: operation === "add" ? undefined : savedEnd,
		internalEntityId,
		balances: [
			balanceFor({
				balanceCase,
				quantity: QUANTITY,
				usage: usageFor(balanceCase),
			}),
		],
	});
	const incomingPlanId = {
		keep: "pro",
		remove: "pro",
		add: "addon",
		switch: "premium",
		customise: "pro",
	}[operation];
	const incoming = planRow({
		planId: incomingPlanId,
		rowId: `cp_${incomingPlanId}_next`,
		isAddOn: operation === "add",
		startsAt: changeAt,
		status: isFuture ? CusProductStatus.Scheduled : CusProductStatus.Active,
		internalEntityId,
		balances: [
			balanceFor({
				balanceCase,
				quantity: operation === "add" ? QUANTITY : QUANTITY * 2,
				usage: 0,
			}),
		],
	});
	const customerEntities = scope === "entity" ? [ENTITY] : [];

	if (operation === "keep") {
		return {
			current: [current],
			phases: [
				{ startsAt: NOW, customerProductIds: [current.id] },
				...(isFuture
					? [{ startsAt: PHASE_TWO, customerProductIds: [current.id] }]
					: []),
			],
			customerEntities,
		};
	}

	const startsIncoming = operation !== "remove";
	const isSaved = scheduledBy === "savedSchedule";
	const outgoing = operation === "add" ? base : current;
	const holders = operation === "add" ? [base] : [current];

	if (!isFuture) {
		return {
			current: holders,
			inserts: startsIncoming ? [incoming] : [],
			expirations: operation === "add" ? [] : [outgoing],
			phases: [
				{
					startsAt: NOW,
					customerProductIds: [
						...(operation === "add" ? [base.id] : []),
						...(startsIncoming ? [incoming.id] : []),
					],
				},
			],
			customerEntities,
		};
	}

	const laterIds = [
		...(operation === "add" ? [base.id] : []),
		...(startsIncoming ? [incoming.id] : []),
	];
	return {
		current: [...holders, ...(isSaved && startsIncoming ? [incoming] : [])],
		inserts: !isSaved && startsIncoming ? [incoming] : [],
		endings:
			!isSaved && operation !== "add"
				? [{ customerProduct: outgoing, endedAt: PHASE_TWO }]
				: [],
		phases: [
			{ startsAt: NOW, customerProductIds: holders.map((row) => row.id) },
			{ startsAt: PHASE_TWO, customerProductIds: laterIds },
		],
		customerEntities,
	};
};

const balanceBefore = (
	change: SetPlansPreviewBalanceChange,
): SetPlansPreviewBalance => ({
	...change.balance,
	...(change.previous_attributes as Partial<SetPlansPreviewBalance>),
});

const grantsAccess = (balance: SetPlansPreviewBalance) =>
	balance.unlimited || balance.granted > 0 || balance.overage_allowed;

/** B2 + B3: the row is a faithful, consistently classified transition. */
const expectRowConsistent = (change: SetPlansPreviewBalanceChange) => {
	const before = balanceBefore(change);
	const after = change.balance;
	expect(Object.keys(change.previous_attributes).length).toBeGreaterThan(0);

	const flipsAccess = grantsAccess(before) !== grantsAccess(after);
	if (flipsAccess) {
		expect(change.behavior).toBe(grantsAccess(after) ? "added" : "removed");
		return;
	}
	if (change.behavior === "reset") {
		expect(before.usage).toBeGreaterThan(0);
		expect(after.usage).toBe(0);
		expect(after.granted).toBe(before.granted);
		expect(after.unlimited).toBe(before.unlimited);
	}
	if (change.behavior === "carried") {
		const keepsUsage = after.usage > 0 && after.usage === before.usage;
		expect(keepsUsage || after.remaining === before.remaining).toBe(true);
	}
};

/** B5: what the projection keeps across a switch mirrors activation. */
const expectConservation = ({
	balanceCase,
	change,
}: {
	balanceCase: BalanceCase;
	change: SetPlansPreviewBalanceChange;
}) => {
	const before = balanceBefore(change);
	const after = change.balance;
	const { kind, operation, timing } = balanceCase;

	if (kind === "oneOffPrepaid" && operation !== "add") {
		expect(after.remaining).toBeGreaterThanOrEqual(before.remaining);
	}
	const switchesPlan = operation === "switch" || operation === "customise";
	if (!switchesPlan || timing !== "future") return;
	if (kind === "allocated") expect(after.usage).toBe(before.usage);
	if (kind === "included" || kind === "payPerUse") expect(after.usage).toBe(0);
};

const assertInvariants = ({
	balanceCase,
	phaseChanges,
	phaseCount,
}: {
	balanceCase: BalanceCase;
	phaseChanges: SetPlansPreviewBalanceChange[][];
	phaseCount: number;
}) => {
	const changeIndex = balanceCase.timing === "future" ? 1 : 0;
	const entityId = balanceCase.scope === "entity" ? ENTITY.id : null;
	expect(phaseChanges).toHaveLength(phaseCount);

	const otherPhaseChanges = phaseChanges.filter(
		(_, phaseIndex) => phaseIndex !== changeIndex,
	);
	for (const unchanged of otherPhaseChanges) expect(unchanged).toEqual([]);
	const changes = phaseChanges[changeIndex] ?? [];
	for (const change of changes) expect(change.entity_id).toBe(entityId);

	const leavesSavedPhaseAlone =
		balanceCase.operation === "keep" ||
		balanceCase.scheduledBy === "savedSchedule";
	if (leavesSavedPhaseAlone) {
		expect(changes).toEqual([]);
		return;
	}

	if (balanceCase.operation === "add") {
		expect(changes.map((change) => change.behavior)).toEqual(["added"]);
	}
	const removesAccess =
		balanceCase.operation === "remove" && balanceCase.kind !== "oneOffPrepaid";
	if (removesAccess) {
		expect(changes.map((change) => change.behavior)).toEqual(["removed"]);
	}

	for (const change of changes) {
		expectRowConsistent(change);
		expectConservation({ balanceCase, change });
	}
};

const allCases: BalanceCase[] = KINDS.flatMap((kind) =>
	PRIORS.flatMap((prior) =>
		OPERATIONS.flatMap((operation) =>
			TIMINGS.flatMap((timing) =>
				SCHEDULED_BY.flatMap((scheduledBy) =>
					SCOPES.map((scope) => ({
						kind,
						prior,
						operation,
						timing,
						scheduledBy,
						scope,
					})),
				),
			),
		),
	),
).filter(isMeaningful);

const caseName = (balanceCase: BalanceCase) =>
	Object.values(balanceCase).join(" · ");

describe(chalk.yellowBright("set_plans balance preview invariants"), () => {
	for (const balanceCase of allCases) {
		test(caseName(balanceCase), async () => {
			const timeline = buildTimeline(balanceCase);
			const phaseChanges = await previewBalanceChanges(timeline);
			assertInvariants({
				balanceCase,
				phaseChanges,
				phaseCount: timeline.phases.length,
			});
		});
	}
});

/** B4: scoped balances partition the customer's aggregate balance. */
const grantedByFeature = (balances: Record<string, { granted: number }>[]) => {
	const totals = new Map<string, number>();
	for (const scopeBalances of balances) {
		for (const [featureId, { granted }] of Object.entries(scopeBalances)) {
			totals.set(featureId, (totals.get(featureId) ?? 0) + granted);
		}
	}
	return Object.fromEntries(totals);
};

describe(chalk.yellowBright("set_plans balance scopes"), () => {
	test("scoped balances add up to the customer's aggregate balance", async () => {
		const otherEntity = entities.create({ id: "ent_b", featureId: "users" });
		const rows: FullCusProduct[] = [
			planRow({
				planId: "pro",
				balances: [included({ featureId: "words", allowance: 100 })],
			}),
			planRow({
				planId: "pro",
				rowId: "cp_pro_a",
				internalEntityId: ENTITY.internal_id,
				balances: [
					included({ featureId: "words", allowance: 200, usage: 50 }),
					oneOffPrepaid({ featureId: "credits", quantity: 30 }),
				],
			}),
			planRow({
				planId: "pro",
				rowId: "cp_pro_b",
				internalEntityId: otherEntity.internal_id,
				balances: [included({ featureId: "seats", allowance: 5, usage: 2 })],
			}),
		];
		const fullCustomer: FullCustomer = {
			...customers.create({ customerProducts: rows }),
			entities: [ENTITY, otherEntity],
		};

		const scoped = await customerToScopedBalances({
			ctx: balanceCtx,
			fullCustomer,
		});
		const { balances: aggregate } = await getApiBalances({
			ctx: balanceCtx,
			fullCus: fullCustomer,
		});

		expect(grantedByFeature(scoped.map(({ balances }) => balances))).toEqual(
			grantedByFeature([aggregate]),
		);
		expect(scoped.map(({ scope }) => scope.entityId)).toEqual([
			null,
			"ent_a",
			"ent_b",
		]);
	});
});

/** A contributor's pooled allowance over the dates its plan is live on one side. */
type ContributionWindow = {
	entity: Entity;
	amount: number;
	from: number;
	until?: number;
};

type PooledAttributionCase = {
	name: string;
	savedRows: FullCusProduct[];
	billingPlan?: Parameters<typeof makeAutumnBillingPlan>[0];
	phases: SchedulePhasePlan[];
	saved: ContributionWindow[];
	desired: ContributionWindow[];
	expectedChanges: string[][];
};

const SECOND_RENEWAL = RENEWAL + ms.days(365);
const POOLED_ALLOWANCE = 10_000;
const RAISED_POOLED_ALLOWANCE = 30_000;

/** Terms of one plan share its pooled entitlement; a different allowance is its own custom entitlement. */
const pooledPlanTerm = ({
	term,
	pooledAllowance = POOLED_ALLOWANCE,
}: {
	term: string;
	pooledAllowance?: number;
}) =>
	pooledCreditsPlan({
		planId: `enterprise_${term}`,
		pooledAllowance,
		pooledEntitlementId: `ent_credits_pooled_${pooledAllowance}`,
		isCustom: pooledAllowance !== POOLED_ALLOWANCE,
	}).product;

const contributionAt = ({
	windows,
	entity,
	at,
}: {
	windows: ContributionWindow[];
	entity: Entity;
	at: number;
}) =>
	windows
		.filter(
			(contribution) =>
				contribution.entity.id === entity.id &&
				contribution.from <= at &&
				(contribution.until === undefined || at < contribution.until),
		)
		.reduce((total, contribution) => total + contribution.amount, 0);

/** Each contributor's attributed grant is exactly its own live contribution, and the pool is their sum. */
const expectPoolAttributedByContribution = async ({
	fullCustomer,
	windows,
	at,
	side,
}: {
	fullCustomer: FullCustomer;
	windows: ContributionWindow[];
	at: number;
	side: "saved" | "desired";
}) => {
	const scoped = await customerToScopedBalances({ ctx, fullCustomer });
	const contributors = [entityA, entityB];
	const attributed = contributors.map((entity) => {
		const scopeBalances = scoped.find(
			({ scope }) => scope.entityId === entity.id,
		);
		return `${side} ${entity.id}: ${scopeBalances?.balances.credits?.granted ?? 0}`;
	});
	const expected = contributors.map(
		(entity) =>
			`${side} ${entity.id}: ${contributionAt({ windows, entity, at })}`,
	);
	expect(attributed).toEqual(expected);

	const poolTotal = contributors.reduce(
		(total, entity) => total + contributionAt({ windows, entity, at }),
		0,
	);
	for (const { pools } of scoped) {
		if (pools.credits) expect(pools.credits.total).toBe(poolTotal);
	}
};

const contributionWindow = ({
	entity,
	from = SUBSCRIBED_AT,
	until,
	amount = POOLED_ALLOWANCE,
}: Partial<ContributionWindow> & { entity: Entity }): ContributionWindow => ({
	entity,
	amount,
	from,
	until,
});

/** Entity A renews through two saved scheduled plans; entity B pools alongside it throughout. */
const renewingRows = () => {
	const [first, second, third] = ["first", "second", "third"].map((term) =>
		pooledPlanTerm({ term }),
	);
	return {
		firstOnA: entityRow({
			product: first,
			entity: entityA,
			rowId: "cp_first_a",
			endedAt: RENEWAL,
		}),
		secondOnA: entityRow({
			product: second,
			entity: entityA,
			rowId: "cp_second_a",
			status: CusProductStatus.Scheduled,
			startsAt: RENEWAL,
			endedAt: SECOND_RENEWAL,
		}),
		thirdOnA: entityRow({
			product: third,
			entity: entityA,
			rowId: "cp_third_a",
			status: CusProductStatus.Scheduled,
			startsAt: SECOND_RENEWAL,
		}),
		firstOnB: entityRow({
			product: first,
			entity: entityB,
			rowId: "cp_first_b",
		}),
	};
};

const pooledAttributionCases = (): PooledAttributionCase[] => {
	const { firstOnA, secondOnA, thirdOnA, firstOnB } = renewingRows();
	const savedRenewals = [
		contributionWindow({ entity: entityA, until: RENEWAL }),
		contributionWindow({
			entity: entityA,
			from: RENEWAL,
			until: SECOND_RENEWAL,
		}),
		contributionWindow({ entity: entityA, from: SECOND_RENEWAL }),
		contributionWindow({ entity: entityB }),
	];
	const openSecondOnA = entityRow({
		product: pooledPlanTerm({ term: "second" }),
		entity: entityA,
		rowId: "cp_second_a",
		status: CusProductStatus.Scheduled,
		startsAt: RENEWAL,
	});
	const scheduledFirstOnB = entityRow({
		product: pooledPlanTerm({ term: "first" }),
		entity: entityB,
		rowId: "cp_first_b",
		status: CusProductStatus.Scheduled,
		startsAt: RENEWAL,
	});
	const openFirstOnA = entityRow({
		product: pooledPlanTerm({ term: "first" }),
		entity: entityA,
		rowId: "cp_first_a",
	});
	const raisedOnA = entityRow({
		product: pooledPlanTerm({
			term: "raised",
			pooledAllowance: RAISED_POOLED_ALLOWANCE,
		}),
		entity: entityA,
		rowId: "cp_raised_a",
		status: CusProductStatus.Scheduled,
		startsAt: RENEWAL,
	});
	const singleRenewal = [
		contributionWindow({ entity: entityA, until: RENEWAL }),
		contributionWindow({ entity: entityA, from: RENEWAL }),
	];

	return [
		{
			name: "single contributor renewing into its saved scheduled plan",
			savedRows: [firstOnA, openSecondOnA],
			phases: [
				{ startsAt: NOW, customerProductIds: [firstOnA.id] },
				{ startsAt: RENEWAL, customerProductIds: [openSecondOnA.id] },
			],
			saved: singleRenewal,
			desired: singleRenewal,
			expectedChanges: [[], []],
		},
		{
			name: "two contributors, every saved phase declared as it is",
			savedRows: [firstOnA, secondOnA, thirdOnA, firstOnB],
			phases: [
				{ startsAt: NOW, customerProductIds: [firstOnA.id, firstOnB.id] },
				{ startsAt: RENEWAL, customerProductIds: [secondOnA.id] },
				{ startsAt: SECOND_RENEWAL, customerProductIds: [thirdOnA.id] },
			],
			saved: savedRenewals,
			desired: savedRenewals,
			expectedChanges: [[], [], []],
		},
		{
			name: "two contributors, the saved middle phase left out of the request",
			savedRows: [firstOnA, secondOnA, thirdOnA, firstOnB],
			billingPlan: {
				updates: [
					makeUpdate({
						customerProduct: firstOnA,
						updates: { ended_at: SECOND_RENEWAL },
					}),
				],
				deletes: [secondOnA],
			},
			phases: [
				{ startsAt: NOW, customerProductIds: [firstOnA.id, firstOnB.id] },
				{ startsAt: SECOND_RENEWAL, customerProductIds: [thirdOnA.id] },
			],
			saved: savedRenewals,
			desired: [
				contributionWindow({ entity: entityA, until: SECOND_RENEWAL }),
				contributionWindow({ entity: entityA, from: SECOND_RENEWAL }),
				contributionWindow({ entity: entityB }),
			],
			expectedChanges: [[], []],
		},
		{
			name: "two scheduled-only contributors starting together",
			savedRows: [openSecondOnA, scheduledFirstOnB],
			phases: [
				{ startsAt: NOW, customerProductIds: [] },
				{
					startsAt: RENEWAL,
					customerProductIds: [openSecondOnA.id, scheduledFirstOnB.id],
				},
			],
			saved: [
				contributionWindow({ entity: entityA, from: RENEWAL }),
				contributionWindow({ entity: entityB, from: RENEWAL }),
			],
			desired: [
				contributionWindow({ entity: entityA, from: RENEWAL }),
				contributionWindow({ entity: entityB, from: RENEWAL }),
			],
			expectedChanges: [[], []],
		},
		{
			name: "one contributor's contribution raised at a later phase",
			savedRows: [openFirstOnA, firstOnB],
			billingPlan: {
				inserts: [raisedOnA],
				updates: [
					makeUpdate({
						customerProduct: openFirstOnA,
						updates: { ended_at: RENEWAL },
					}),
				],
			},
			phases: [
				{ startsAt: NOW, customerProductIds: [openFirstOnA.id, firstOnB.id] },
				{ startsAt: RENEWAL, customerProductIds: [raisedOnA.id] },
			],
			saved: [
				contributionWindow({ entity: entityA }),
				contributionWindow({ entity: entityB }),
			],
			desired: [
				contributionWindow({ entity: entityA, until: RENEWAL }),
				contributionWindow({
					entity: entityA,
					from: RENEWAL,
					amount: RAISED_POOLED_ALLOWANCE,
				}),
				contributionWindow({ entity: entityB }),
			],
			expectedChanges: [
				[],
				[
					"ent_a/credits updated: 10000 -> 30000 granted, usage-based, pool 20000 -> 40000 across 2",
				],
			],
		},
	];
};

const futureSavedStarts = (savedRows: FullCusProduct[]) =>
	savedRows.map(({ starts_at }) => starts_at).filter((at) => at > NOW);

describe(
	chalk.yellowBright("set_plans pooled balances: attributed by contribution"),
	() => {
		for (const [caseIndex, { name }] of pooledAttributionCases().entries()) {
			test(name, async () => {
				// Projections mutate the rows they are given, so every case builds its own.
				const attributionCase = pooledAttributionCases()[caseIndex];
				if (!attributionCase) throw new Error(`No pooled case ${caseIndex}`);
				const { savedRows, phases, saved, desired, expectedChanges } =
					attributionCase;
				const fullCustomer = customerWithPools(savedRows);
				const autumnBillingPlan = makeAutumnBillingPlan(
					attributionCase.billingPlan,
				);
				const phaseCustomers = buildSetPlansPhaseCustomers({
					ctx,
					fullCustomer,
					autumnBillingPlan,
					phases,
				});
				const savedDates = [
					...new Set([
						...phases.slice(1).map(({ startsAt }) => startsAt),
						...futureSavedStarts(savedRows),
					]),
				].sort((first, second) => first - second);
				const savedCustomerAt = (at: number) =>
					buildSavedPhaseCustomers({
						ctx,
						fullCustomer,
						autumnBillingPlan,
						phases,
						dates: [at],
						now: NOW,
					}).get(at) ?? fullCustomer;

				for (const [phaseIndex, phase] of phases.entries()) {
					await expectPoolAttributedByContribution({
						fullCustomer: phaseCustomers[phaseIndex] ?? fullCustomer,
						windows: desired,
						at: phase.startsAt,
						side: "desired",
					});
				}
				await expectPoolAttributedByContribution({
					fullCustomer,
					windows: saved,
					at: NOW,
					side: "saved",
				});
				for (const at of savedDates) {
					await expectPoolAttributedByContribution({
						fullCustomer: savedCustomerAt(at),
						windows: saved,
						at,
						side: "saved",
					});
				}

				const phaseChanges = await setPlansPhaseBalanceChanges({
					ctx,
					originalFullCustomer: fullCustomer,
					phaseCustomers,
					savedComparisonCustomers: savedComparisonCustomers({
						ctx,
						fullCustomer,
						autumnBillingPlan,
						phases,
						matches: exactDateMatches({ current: savedRows, phases }),
						now: NOW,
					}),
				});
				expect(describePooledPhases(phaseChanges)).toEqual(expectedChanges);
			});
		}
	},
);
