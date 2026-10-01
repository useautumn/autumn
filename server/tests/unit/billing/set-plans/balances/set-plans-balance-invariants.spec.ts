/**
 * Generated balance-preview cases (kind × prior usage × operation × timing × origin × scope),
 * each checked against the invariants in the balances audit rather than a hand-written answer.
 */
import { describe, expect, test } from "bun:test";
import { getApiBalances } from "@api/customers/cusFeatures";
import {
	CusProductStatus,
	type FullCusProduct,
	type FullCustomer,
	type SetPlansPreviewBalance,
	type SetPlansPreviewBalanceChange,
} from "@autumn/shared";
import { customers } from "@tests/utils/fixtures/db/customers";
import { entities } from "@tests/utils/fixtures/db/entities";
import chalk from "chalk";
import { customerToScopedBalances } from "@/internal/billing/v2/actions/setPlans/preview/balances/customerToScopedBalances";
import {
	type BalanceFeatureId,
	type BalanceTimeline,
	balanceCtx,
	included,
	NOW,
	oneOffPrepaid,
	PHASE_TWO,
	payPerUse,
	planRow,
	previewBalanceChanges,
	type RowBalance,
} from "./balanceFixtures";

const KINDS = ["included", "allocated", "payPerUse", "oneOffPrepaid"] as const;
const PRIORS = ["fresh", "partial", "overage"] as const;
const OPERATIONS = ["keep", "remove", "add", "switch", "customise"] as const;
const TIMINGS = ["immediate", "future"] as const;
const ORIGINS = ["request", "saved"] as const;
const SCOPES = ["customer", "entity"] as const;

type BalanceCase = {
	kind: (typeof KINDS)[number];
	prior: (typeof PRIORS)[number];
	operation: (typeof OPERATIONS)[number];
	timing: (typeof TIMINGS)[number];
	origin: (typeof ORIGINS)[number];
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

/** Overage only exists where something is granted to exceed; one-off credits can't go below zero. */
const isMeaningful = ({
	kind,
	prior,
	operation,
	timing,
	origin,
}: BalanceCase) =>
	!(
		prior === "overage" &&
		(kind === "payPerUse" || kind === "oneOffPrepaid")
	) &&
	!(origin === "saved" && (timing === "immediate" || operation === "keep"));

const buildTimeline = (balanceCase: BalanceCase): BalanceTimeline => {
	const { operation, timing, origin, scope } = balanceCase;
	const internalEntityId = scope === "entity" ? ENTITY.internal_id : undefined;
	const isFuture = timing === "future";
	const changeAt = isFuture ? PHASE_TWO : NOW;
	const savedEnd = origin === "saved" ? PHASE_TWO : undefined;

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
	const isSaved = origin === "saved";
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

	if (balanceCase.operation === "keep") expect(changes).toEqual([]);
	for (const change of changes) expect(change.origin).toBe(balanceCase.origin);

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
				ORIGINS.flatMap((origin) =>
					SCOPES.map((scope) => ({
						kind,
						prior,
						operation,
						timing,
						origin,
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
