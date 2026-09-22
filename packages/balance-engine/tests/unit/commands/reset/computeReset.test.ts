import { describe, expect, test } from "bun:test";
import {
	EntInterval,
	getNextResetAt,
	PooledBalanceResetMode,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import {
	applyMutation,
	computeReset,
	computeTrack,
	createSubjectState,
	fullSubjectToPoolsNeedingPromotion,
	type ResetCommand,
	StaleMutationError,
	type SubjectState,
	type WorkerCustomerEntitlement,
	type WorkerCustomerProduct,
} from "../../../../src/balanceEngine.js";
import {
	createCustomerEntitlement,
	createCustomerProduct,
	createSubjectFor,
	createTrackCommand,
	identity,
	occurredAt,
	org,
	trackResultOf,
} from "../../engineFixtures.js";

/** The fixture grant is 1000 a month. */
const ALLOWANCE = 1000;
const asOf = occurredAt;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
/** What the shared stepping lands on: the first monthly boundary after asOf. */
const nextMonthAfterAsOf = ({ from }: { from: number }) =>
	getNextResetAt({
		curReset: from,
		interval: EntInterval.Month,
		intervalCount: 1,
		now: asOf,
	});

const stateWith = ({
	row = {},
	product = {},
}: {
	row?: Partial<WorkerCustomerEntitlement>;
	product?: Partial<WorkerCustomerProduct>;
} = {}): SubjectState =>
	createSubjectState({
		identity,
		customerProducts: [{ ...createCustomerProduct(), ...product }],
		customerEntitlements: [
			{
				...createCustomerEntitlement({ balance: 250 }),
				next_reset_at: asOf - 1,
				...row,
			},
		],
	});

const resetCommand = ({
	persistFreeOverage = false,
}: {
	persistFreeOverage?: boolean;
} = {}): ResetCommand => ({
	schemaVersion: 1,
	type: "reset",
	commandId: "cmd_reset_1",
	requestId: "req_reset_1",
	identity,
	occurredAt: asOf,
	org: {
		...org,
		config: { ...org.config, persist_free_overage: persistFreeOverage },
	},
});

const resetOf = ({
	state,
	command = resetCommand(),
}: {
	state: SubjectState;
	command?: ResetCommand;
}) => computeReset({ fullSubject: createSubjectFor({ state }), command });

describe("computeReset", () => {
	test("nothing due writes nothing", () => {
		expect(
			resetOf({ state: stateWith({ row: { next_reset_at: asOf + 1 } }) }),
		).toBeNull();
	});

	test("a due row refills to its grant on the next cycle, guarded by the cycle that ended", () => {
		const state = stateWith();
		const mutation = resetOf({ state });
		expect(mutation?.changes).toEqual([
			{
				table: "customerEntitlements",
				op: "update",
				id: "messages_monthly",
				before: { next_reset_at: asOf - 1 },
				after: {
					balance: ALLOWANCE,
					additional_balance: 0,
					adjustment: 0,
					usage_attribution: {},
					next_reset_at: nextMonthAfterAsOf({ from: asOf - 1 }),
				},
			},
		]);
		expect(mutation?.result).toEqual({
			type: "reset",
			rows: [
				{
					customerEntitlementId: "messages_monthly",
					featureId: "messages",
					cycleEndedAt: asOf - 1,
					nextResetAt: nextMonthAfterAsOf({ from: asOf - 1 }),
				},
			],
		});
	});

	test("the next track draws from the refilled cycle", () => {
		const state = stateWith({ row: { balance: 0 } });
		const mutation = resetOf({ state });
		if (!mutation) throw new Error("expected a reset");
		const refilled = applyMutation({ state, mutation });

		const track = computeTrack({
			fullSubject: createSubjectFor({ state: refilled }),
			command: createTrackCommand({ value: 5 }),
		});
		expect(trackResultOf({ mutation: track }).status).toBe("applied");
		expect(
			applyMutation({ state: refilled, mutation: track })
				.customerEntitlements[0]?.balance,
		).toBe(ALLOWANCE - 5);
	});

	test("a long-idle row lands on the first boundary after asOf, not the one it slept past", () => {
		const cycleEndedAt = asOf - 3 * MONTH_MS;
		const mutation = resetOf({
			state: stateWith({ row: { next_reset_at: cycleEndedAt } }),
		});
		const nextResetAt =
			mutation?.result.type === "reset"
				? mutation.result.rows[0]?.nextResetAt
				: undefined;
		expect(nextResetAt).toBe(nextMonthAfterAsOf({ from: cycleEndedAt }));
		expect(nextResetAt).toBeGreaterThan(asOf);
		expect(nextResetAt).toBeLessThanOrEqual(asOf + 31 * 24 * 60 * 60 * 1000);
	});

	test("a pending billing-anchor reset caps the next cycle", () => {
		const anchorResetsAt = asOf + 1000;
		const mutation = resetOf({
			state: stateWith({
				product: { billing_cycle_anchor_resets_at: anchorResetsAt },
			}),
		});
		expect(
			mutation?.result.type === "reset"
				? mutation.result.rows[0]?.nextResetAt
				: undefined,
		).toBe(anchorResetsAt);
	});

	test("free overage carries into the new cycle only when the org keeps it", () => {
		const overdrawn = stateWith({ row: { balance: -40 } });
		const balanceAfter = ({
			persistFreeOverage,
		}: {
			persistFreeOverage: boolean;
		}) => {
			const mutation = resetOf({
				state: overdrawn,
				command: resetCommand({ persistFreeOverage }),
			});
			if (!mutation) throw new Error("expected a reset");
			return applyMutation({ state: overdrawn, mutation })
				.customerEntitlements[0]?.balance;
		};
		expect(balanceAfter({ persistFreeOverage: false })).toBe(ALLOWANCE);
		expect(balanceAfter({ persistFreeOverage: true })).toBe(ALLOWANCE - 40);
	});

	test("a per-entity grant refills each entity's own balance", () => {
		const state = stateWith({
			row: {
				entities: {
					ent_a: { id: "ent_a", balance: 3, adjustment: -2 },
					ent_b: { id: "ent_b", balance: -10, adjustment: 0 },
				},
			},
		});
		const fullSubject = createSubjectFor({ state });
		const catalogRow =
			fullSubject.customer_products[0]?.customer_entitlements[0];
		if (!catalogRow) throw new Error("expected the fixture row");
		catalogRow.entitlement.entity_feature_id = "seats";

		const mutation = computeReset({ fullSubject, command: resetCommand() });
		expect(
			mutation?.changes[0]?.op === "update" && mutation.changes[0].after,
		).toEqual({
			entities: {
				ent_a: { id: "ent_a", balance: ALLOWANCE, adjustment: 0 },
				ent_b: { id: "ent_b", balance: ALLOWANCE, adjustment: 0 },
			},
			usage_attribution: {},
			next_reset_at: nextMonthAfterAsOf({ from: asOf - 1 }),
		});
	});

	test("what is left on the row carries over as a rollover, expiring the configured months after the cycle that ended", () => {
		const state = stateWith({ row: { balance: 30 } });
		const fullSubject = createSubjectFor({ state });
		const grant = fullSubject.customer_products[0]?.customer_entitlements[0];
		if (!grant) throw new Error("expected the fixture row");
		grant.entitlement.rollover = {
			max: 50,
			duration: RolloverExpiryDurationType.Month,
			length: 1,
		};

		const mutation = computeReset({ fullSubject, command: resetCommand() });
		const inserted = mutation?.changes.find(
			(change) => change.table === "rollovers" && change.op === "insert",
		);
		expect(inserted?.op === "insert" && inserted.row).toMatchObject({
			cus_ent_id: "messages_monthly",
			balance: 30,
			usage: 0,
			expires_at: getNextResetAt({
				curReset: asOf - 1,
				interval: EntInterval.Month,
				intervalCount: 1,
				now: asOf - 1,
			}),
			entities: {},
		});
		const refilled = applyMutation({ state, mutation: mutation! });
		expect(refilled.customerEntitlements[0]?.balance).toBe(ALLOWANCE);
		expect(refilled.rollovers.map((rollover) => rollover.balance)).toEqual([
			30,
		]);
	});

	test("the cap trims the oldest rollover first and the new one is inserted trimmed if it overflows alone", () => {
		const state = createSubjectState({
			identity,
			customerProducts: [createCustomerProduct()],
			customerEntitlements: [
				{
					...createCustomerEntitlement({ balance: 30 }),
					next_reset_at: asOf - 1,
				},
			],
			rollovers: [
				{
					id: "roll_old",
					cus_ent_id: "messages_monthly",
					balance: 40,
					usage: 0,
					expires_at: asOf + 1000,
					entities: {},
				},
			],
		});
		const fullSubject = createSubjectFor({ state });
		const grant = fullSubject.customer_products[0]?.customer_entitlements[0];
		if (!grant) throw new Error("expected the fixture row");
		grant.entitlement.rollover = {
			max: 50,
			duration: RolloverExpiryDurationType.Month,
			length: 1,
		};

		const mutation = computeReset({ fullSubject, command: resetCommand() });
		const refilled = applyMutation({ state, mutation: mutation! });
		// 40 + 30 = 70 against a cap of 50: the oldest gives up 20, the new row keeps its 30.
		expect(
			refilled.rollovers.map(({ id, balance }) => ({ id, balance })),
		).toEqual([
			{ id: "roll_old", balance: 20 },
			{ id: expect.stringMatching(/^roll_/), balance: 30 },
		]);
		expect(
			mutation?.changes.find(
				(change) => change.table === "rollovers" && change.op === "update",
			),
		).toMatchObject({
			id: "roll_old",
			before: { balance: 40 },
			after: { balance: 20 },
		});
	});

	const POOL_ID = "pb_1";
	const pooledState = ({
		granted = 150,
		resetMode = PooledBalanceResetMode.Subscription,
		unlimited = false,
	}: {
		granted?: number;
		resetMode?: PooledBalanceResetMode;
		unlimited?: boolean;
	} = {}): SubjectState =>
		createSubjectState({
			identity,
			customerEntitlements: [
				{
					...createCustomerEntitlement({ id: "pool_ce", balance: 20 }),
					customer_product_id: null,
					is_pooled_balance: true,
					pooled_balance_id: POOL_ID,
					next_reset_at: asOf - 1,
				},
			],
			pooledBalances: [
				{
					id: POOL_ID,
					customer_entitlement_id: "pool_ce",
					granted,
					unlimited,
					reset_mode: resetMode,
				},
			],
		});

	test("a pool refills from the grant the sender promoted, and the pool row moves with it", () => {
		const state = pooledState({ granted: 150 });
		const mutation = resetOf({
			state,
			command: { ...resetCommand(), pooledGranted: { [POOL_ID]: 170 } },
		});
		expect(mutation?.changes).toEqual([
			{
				table: "pooledBalances",
				op: "update",
				id: POOL_ID,
				before: { granted: 150 },
				after: { granted: 170 },
			},
			expect.objectContaining({
				table: "customerEntitlements",
				id: "pool_ce",
				after: expect.objectContaining({ balance: 170 }),
			}),
		]);
		const refilled = applyMutation({ state, mutation: mutation! });
		expect(refilled.pooledBalances[0]?.granted).toBe(170);
		expect(refilled.customerEntitlements[0]?.balance).toBe(170);
	});

	test("without a promoted grant the pool refills from what it holds and its row is untouched", () => {
		const state = pooledState({ granted: 150 });
		const mutation = resetOf({ state });
		expect(mutation?.changes.map((change) => change.table)).toEqual([
			"customerEntitlements",
		]);
		expect(
			applyMutation({ state, mutation: mutation! }).customerEntitlements[0]
				?.balance,
		).toBe(150);
	});

	test("a lifetime pool never refills", () => {
		expect(
			resetOf({
				state: pooledState({ resetMode: PooledBalanceResetMode.Lifetime }),
			}),
		).toBeNull();
	});

	test("only a due, limited pool asks for a promotion", () => {
		const poolsOf = (state: SubjectState) =>
			fullSubjectToPoolsNeedingPromotion({
				fullSubject: createSubjectFor({ state }),
				asOf,
			});
		expect(poolsOf(pooledState())).toEqual([POOL_ID]);
		expect(poolsOf(pooledState({ unlimited: true }))).toEqual([]);
		expect(
			poolsOf(pooledState({ resetMode: PooledBalanceResetMode.Lifetime })),
		).toEqual([]);
	});

	test("replaying a reset onto a row already on the next cycle is stale", () => {
		const state = stateWith();
		const mutation = resetOf({ state });
		if (!mutation) throw new Error("expected a reset");
		const refilled = applyMutation({ state, mutation });
		expect(() =>
			applyMutation({
				state: refilled,
				mutation: { ...mutation, revision: { before: 1, after: 2 } },
			}),
		).toThrow(StaleMutationError);
	});
});
