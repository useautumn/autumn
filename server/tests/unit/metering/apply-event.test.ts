import { describe, expect, test } from "bun:test";
import { applyEvent } from "@/internal/metering/fold/applyEvent.js";
import { canonicalSerialize } from "@/internal/metering/fold/canonicalSerialize.js";
import {
	createMeterState,
	DEFAULT_DEDUPE_CAPACITY,
	readFeatureMeter,
} from "@/internal/metering/fold/meterState.js";
import { makeEvent } from "./metering-test-fixtures.js";

const meterOf = ({
	state,
	customerId = "cus_1",
	featureId = "messages",
}: {
	state: ReturnType<typeof createMeterState>;
	customerId?: string;
	featureId?: string;
}) => readFeatureMeter({ state, customerId, featureId });

describe("applyEvent fold", () => {
	test("grant adds to granted and balance", () => {
		const { state, result } = applyEvent({
			state: createMeterState(),
			event: makeEvent({ id: "evt_1", type: "grant", value: 100 }),
		});

		expect(result).toBe("applied");
		expect(meterOf({ state })).toEqual({ granted: 100, balance: 100 });
	});

	test("grants accumulate", () => {
		let state = createMeterState();
		for (const id of ["evt_1", "evt_2"]) {
			state = applyEvent({
				state,
				event: makeEvent({ id, type: "grant", value: 50 }),
			}).state;
		}

		expect(meterOf({ state })).toEqual({ granted: 100, balance: 100 });
	});

	test("deduct subtracts when the balance covers it", () => {
		const granted = applyEvent({
			state: createMeterState(),
			event: makeEvent({ id: "evt_1", type: "grant", value: 100 }),
		}).state;

		const { state, result } = applyEvent({
			state: granted,
			event: makeEvent({ id: "evt_2", type: "deduct", value: 30 }),
		});

		expect(result).toBe("applied");
		expect(meterOf({ state })).toEqual({ granted: 100, balance: 70 });
	});

	test("deduct of exactly the balance is applied", () => {
		const granted = applyEvent({
			state: createMeterState(),
			event: makeEvent({ id: "evt_1", type: "grant", value: 10 }),
		}).state;

		const { state, result } = applyEvent({
			state: granted,
			event: makeEvent({ id: "evt_2", type: "deduct", value: 10 }),
		});

		expect(result).toBe("applied");
		expect(meterOf({ state })).toEqual({ granted: 10, balance: 0 });
	});

	test("deduct beyond the balance is rejected and leaves balances untouched", () => {
		const granted = applyEvent({
			state: createMeterState(),
			event: makeEvent({ id: "evt_1", type: "grant", value: 10 }),
		}).state;

		const { state, result } = applyEvent({
			state: granted,
			event: makeEvent({ id: "evt_2", type: "deduct", value: 11 }),
		});

		expect(result).toBe("rejected_insufficient");
		expect(state.customers).toEqual(granted.customers);
	});

	test("deduct against an unknown feature is rejected", () => {
		const { state, result } = applyEvent({
			state: createMeterState(),
			event: makeEvent({ id: "evt_1", type: "deduct", value: 1 }),
		});

		expect(result).toBe("rejected_insufficient");
		expect(meterOf({ state })).toBeUndefined();
	});

	test("reset restores balance to granted", () => {
		let state = createMeterState();
		for (const event of [
			makeEvent({ id: "evt_1", type: "grant", value: 100 }),
			makeEvent({ id: "evt_2", type: "deduct", value: 80 }),
			makeEvent({ id: "evt_3", type: "reset", value: 1 }),
		]) {
			state = applyEvent({ state, event }).state;
		}

		expect(meterOf({ state })).toEqual({ granted: 100, balance: 100 });
	});

	test("state is keyed per customer and per feature", () => {
		let state = createMeterState();
		for (const event of [
			makeEvent({ id: "evt_1", type: "grant", value: 10 }),
			makeEvent({
				id: "evt_2",
				type: "grant",
				value: 20,
				featureId: "credits",
			}),
			makeEvent({
				id: "evt_3",
				type: "grant",
				value: 30,
				customerId: "cus_2",
			}),
		]) {
			state = applyEvent({ state, event }).state;
		}

		expect(meterOf({ state })).toEqual({ granted: 10, balance: 10 });
		expect(meterOf({ state, featureId: "credits" })).toEqual({
			granted: 20,
			balance: 20,
		});
		expect(meterOf({ state, customerId: "cus_2" })).toEqual({
			granted: 30,
			balance: 30,
		});
	});

	test("a repeated event id is a duplicate and does not move balances", () => {
		const event = makeEvent({ id: "evt_1", type: "grant", value: 100 });
		const first = applyEvent({ state: createMeterState(), event });
		const second = applyEvent({ state: first.state, event });

		expect(first.result).toBe("applied");
		expect(second.result).toBe("duplicate");
		expect(canonicalSerialize({ state: second.state })).toBe(
			canonicalSerialize({ state: first.state }),
		);
	});

	test("the dedupe window is bounded and evicts in insertion order", () => {
		let state = createMeterState({ dedupeCapacity: 2 });
		for (const id of ["evt_1", "evt_2", "evt_3"]) {
			state = applyEvent({
				state,
				event: makeEvent({ id, type: "grant", value: 1 }),
			}).state;
		}

		expect(state.dedupe.ids).toEqual(["evt_2", "evt_3"]);

		const replayEvicted = applyEvent({
			state,
			event: makeEvent({ id: "evt_1", type: "grant", value: 1 }),
		});
		expect(replayEvicted.result).toBe("applied");

		const replayRetained = applyEvent({
			state: replayEvicted.state,
			event: makeEvent({ id: "evt_3", type: "grant", value: 1 }),
		});
		expect(replayRetained.result).toBe("duplicate");
	});

	test("the dedupe window defaults to 10_000 ids", () => {
		expect(DEFAULT_DEDUPE_CAPACITY).toBe(10_000);
		expect(createMeterState().dedupe.capacity).toBe(10_000);
	});

	test("the fold does not mutate the state it was given", () => {
		const before = applyEvent({
			state: createMeterState(),
			event: makeEvent({ id: "evt_1", type: "grant", value: 100 }),
		}).state;
		const beforeSerialized = canonicalSerialize({ state: before });

		applyEvent({
			state: before,
			event: makeEvent({ id: "evt_2", type: "deduct", value: 40 }),
		});

		expect(canonicalSerialize({ state: before })).toBe(beforeSerialized);
	});
});
