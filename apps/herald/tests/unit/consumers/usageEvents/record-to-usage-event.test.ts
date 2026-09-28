import { describe, expect, test } from "bun:test";
import {
	applyMutation,
	computeFinalize,
	computeTrack,
	createSubjectState,
	type MutationRecord,
	type SubjectState,
	subjectStateToFullSubject,
	type TrackCommand,
} from "@autumn/balance-engine";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	createTrackCommand,
	identity,
	occurredAt,
} from "../../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { recordToUsageEvent } from "../../../../src/consumers/usageEvents/actions/recordToUsageEvent.js";

const position = { topic: "local-events", partition: 3, offset: 44n };

/** A real track through the engine, stamped the way the writer stamps it; `balance: null` holds no grant. */
const trackRecord = ({
	balance,
	value,
	overrides = {},
}: {
	balance: number | null;
	value: number;
	overrides?: Partial<TrackCommand>;
}): MutationRecord => {
	const state = createSubjectState({
		identity,
		customerProducts: [createCustomerProduct()],
		customerEntitlements:
			balance === null ? [] : [createCustomerEntitlement({ balance })],
	});
	const mutation = computeTrack({
		fullSubject: subjectStateToFullSubject({
			state,
			catalog: createCatalogFor({ state }),
		}),
		command: {
			...createTrackCommand({ value }),
			properties: { model: "x" },
			...overrides,
		},
	});
	return { ...mutation, receipt: { fingerprint: "f", expiresAt: 1 } };
};

const stamp = (mutation: Omit<MutationRecord, "receipt">): MutationRecord => ({
	...mutation,
	receipt: { fingerprint: "f", expiresAt: 1 },
});
const subjectOf = ({ state }: { state: SubjectState }) =>
	subjectStateToFullSubject({ state, catalog: createCatalogFor({ state }) });

/** A lock of 8 taken with its own properties, then settled at `finalValue`: the two records a lock leaves on the log. */
const lockThenFinalize = ({
	finalValue,
	finalizeProperties = null,
}: {
	finalValue: number;
	finalizeProperties?: Record<string, string> | null;
}): { lockRecord: MutationRecord; finalizeRecord: MutationRecord } => {
	const state = createSubjectState({
		identity,
		customerProducts: [createCustomerProduct()],
		customerEntitlements: [createCustomerEntitlement({ balance: 15 })],
	});
	const lockMutation = computeTrack({
		fullSubject: subjectOf({ state }),
		command: {
			...createTrackCommand({ value: 8, commandId: "cmd_lock" }),
			properties: { model: "x" },
			lock: {
				id: "lck_1",
				lockId: "L1",
				expiresAt: occurredAt + 86_400_000,
				expiryAction: "confirm",
			},
		},
	});
	const lockChange = lockMutation.changes.find(
		(change) => change.table === "locks" && change.op === "insert",
	);
	if (lockChange?.table !== "locks" || lockChange.op !== "insert")
		throw new Error("Expected the track to open a lock");
	const locked = applyMutation({ state, mutation: lockMutation });
	const finalizeMutation = computeFinalize({
		fullSubject: subjectOf({ state: locked }),
		command: {
			schemaVersion: 1,
			type: "finalize",
			commandId: "cmd_finalize",
			requestId: "req_finalize",
			identity,
			occurredAt,
			org: createTrackCommand({ value: 8 }).org,
			lock: lockChange.row,
			internalFeatureId: "feat_messages",
			finalValue,
			properties: finalizeProperties,
		},
	});
	return {
		lockRecord: stamp(lockMutation),
		finalizeRecord: stamp(finalizeMutation),
	};
};

describe("recordToUsageEvent", () => {
	test("an applied track becomes one event, named by its place in the log", () => {
		const event = recordToUsageEvent({
			position,
			record: trackRecord({ balance: 10, value: 5 }),
		});
		expect(event).toMatchObject({
			id: "local-events:3:44",
			org_id: identity.orgId,
			env: identity.env,
			customer_id: identity.customerId,
			internal_customer_id: "cus_1",
			entity_id: null,
			internal_entity_id: null,
			event_name: "messages",
			value: 5,
			properties: { model: "x" },
			created_at: occurredAt,
			set_usage: false,
			internal_product_id: "prod_internal_pro",
			deductions: [{ balance_id: "messages_monthly", value: 5 }],
		});
		expect(event?.timestamp).toEqual(new Date(occurredAt));
	});

	test("the same record at the same place always makes the same event", () => {
		const record = trackRecord({ balance: 10, value: 5 });
		expect(recordToUsageEvent({ position, record })).toEqual(
			recordToUsageEvent({ position, record }),
		);
	});

	test("a refused track moved no usage, so it makes no event", () => {
		expect(
			recordToUsageEvent({
				position,
				record: trackRecord({ balance: 3, value: 5 }),
			}),
		).toBeNull();
	});

	test("a track nothing funds still makes its event, with no breakdown, as legacy does", () => {
		const event = recordToUsageEvent({
			position,
			record: trackRecord({
				balance: null,
				value: 5,
				overrides: { overageBehavior: "cap" },
			}),
		});
		expect(event).toMatchObject({
			id: "local-events:3:44",
			customer_id: identity.customerId,
			event_name: "messages",
			value: 5,
			properties: { model: "x" },
			internal_product_id: null,
			deductions: null,
		});
	});

	test("an event-name track is named by its event, and only the command that records it makes one", () => {
		const recorded = recordToUsageEvent({
			position,
			record: trackRecord({
				balance: 10,
				value: 5,
				overrides: {
					usageEvent: { name: "chat_message", idempotencyKey: null, id: null },
				},
			}),
		});
		expect(recorded).toMatchObject({ event_name: "chat_message", value: 5 });
		expect(
			recordToUsageEvent({
				position,
				record: trackRecord({
					balance: 10,
					value: 5,
					overrides: { usageEvent: null },
				}),
			}),
		).toBeNull();
	});

	test("the caller's idempotency key and event id land on the event, as legacy writes them", () => {
		const event = recordToUsageEvent({
			position,
			record: trackRecord({
				balance: 10,
				value: 5,
				overrides: {
					usageEvent: {
						name: "messages",
						idempotencyKey: "key_1",
						id: "evt_caller",
					},
				},
			}),
		});
		expect(event).toMatchObject({
			id: "evt_caller",
			idempotency_key: "key_1",
			event_name: "messages",
		});
		// Without a caller id the event is named by its place in the log, and a key-less track stores null.
		expect(
			recordToUsageEvent({
				position,
				record: trackRecord({ balance: 10, value: 5 }),
			}),
		).toMatchObject({ id: "local-events:3:44", idempotency_key: null });
	});

	test("a record written before it named its subject makes no event", () => {
		const { subject: _subject, ...older } = trackRecord({
			balance: 10,
			value: 5,
		});
		expect(recordToUsageEvent({ position, record: older })).toBeNull();
	});
	test("a lock reports what it took, and its finalize reports only the difference", () => {
		const eventValueOf = (record: MutationRecord) =>
			recordToUsageEvent({ position, record })?.value;
		expect(eventValueOf(lockThenFinalize({ finalValue: 8 }).lockRecord)).toBe(
			8,
		);
		expect(
			eventValueOf(lockThenFinalize({ finalValue: 11 }).finalizeRecord),
		).toBe(3);
		expect(
			eventValueOf(lockThenFinalize({ finalValue: 5 }).finalizeRecord),
		).toBe(-3);
		// A release, and an expiry, settle at zero.
		expect(
			eventValueOf(lockThenFinalize({ finalValue: 0 }).finalizeRecord),
		).toBe(-8);
	});

	test("a finalize at exactly the lock's value reports nothing", () => {
		const { finalizeRecord } = lockThenFinalize({ finalValue: 8 });
		expect(recordToUsageEvent({ position, record: finalizeRecord })).toBeNull();
	});

	test("a finalize carries the lock's properties unless it sends its own", () => {
		const inherited = lockThenFinalize({ finalValue: 5 }).finalizeRecord;
		const overridden = lockThenFinalize({
			finalValue: 5,
			finalizeProperties: { model: "y" },
		}).finalizeRecord;
		expect(recordToUsageEvent({ position, record: inherited })).toMatchObject({
			event_name: "messages",
			properties: { model: "x" },
		});
		expect(recordToUsageEvent({ position, record: overridden })).toMatchObject({
			properties: { model: "y" },
		});
	});

	test("a finalize's breakdown is signed the way the balance moved", () => {
		const { finalizeRecord } = lockThenFinalize({ finalValue: 5 });
		expect(
			recordToUsageEvent({ position, record: finalizeRecord }),
		).toMatchObject({
			value: -3,
			deductions: [{ balance_id: "messages_monthly", value: -3 }],
		});
	});
});
