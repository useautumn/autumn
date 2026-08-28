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
	orgId = "org_1",
	env = "sandbox",
	customerId = "cus_1",
	featureId = "messages",
}: {
	state: ReturnType<typeof createMeterState>;
	orgId?: string;
	env?: string;
	customerId?: string;
	featureId?: string;
}) => readFeatureMeter({ state, orgId, env, customerId, featureId });

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

	test("set creates the meter when nothing has been granted yet", () => {
		const { state, result } = applyEvent({
			state: createMeterState(),
			event: makeEvent({ id: "evt_1", type: "set", value: 1000 }),
		});

		expect(result).toBe("applied");
		expect(meterOf({ state })).toEqual({ granted: 1000, balance: 1000 });
	});

	test("set overwrites whatever the meter held", () => {
		let state = createMeterState();
		for (const event of [
			makeEvent({ id: "evt_1", type: "grant", value: 100 }),
			makeEvent({ id: "evt_2", type: "deduct", value: 40 }),
			makeEvent({ id: "evt_3", type: "set", value: 7 }),
		]) {
			state = applyEvent({ state, event }).state;
		}

		expect(meterOf({ state })).toEqual({ granted: 7, balance: 7 });
	});

	test("set to zero is representable and leaves nothing to spend", () => {
		let state = createMeterState();
		for (const event of [
			makeEvent({ id: "evt_1", type: "grant", value: 100 }),
			makeEvent({ id: "evt_2", type: "set", value: 0 }),
		]) {
			state = applyEvent({ state, event }).state;
		}

		expect(meterOf({ state })).toEqual({ granted: 0, balance: 0 });

		const spend = applyEvent({
			state,
			event: makeEvent({ id: "evt_3", type: "deduct", value: 1 }),
		});
		expect(spend.result).toBe("rejected_insufficient");
	});

	test("a deduct after a set spends against the set balance", () => {
		let state = createMeterState();
		for (const event of [
			makeEvent({ id: "evt_1", type: "set", value: 1000 }),
			makeEvent({ id: "evt_2", type: "deduct", value: 13 }),
		]) {
			state = applyEvent({ state, event }).state;
		}

		expect(meterOf({ state })).toEqual({ granted: 1000, balance: 987 });
	});

	test("a set after a deduct discards the prior usage", () => {
		let state = createMeterState();
		for (const event of [
			makeEvent({ id: "evt_1", type: "grant", value: 1000 }),
			makeEvent({ id: "evt_2", type: "deduct", value: 13 }),
			makeEvent({ id: "evt_3", type: "set", value: 500 }),
		]) {
			state = applyEvent({ state, event }).state;
		}

		expect(meterOf({ state })).toEqual({ granted: 500, balance: 500 });
	});

	test("a reset after a set restores the set value", () => {
		// A set rewrites granted as well as balance, so the meter a later reset
		// restores to is the set post-state, not the pre-set allowance.
		let state = createMeterState();
		for (const event of [
			makeEvent({ id: "evt_1", type: "grant", value: 1000 }),
			makeEvent({ id: "evt_2", type: "set", value: 500 }),
			makeEvent({ id: "evt_3", type: "deduct", value: 200 }),
			makeEvent({ id: "evt_4", type: "reset", value: 1 }),
		]) {
			state = applyEvent({ state, event }).state;
		}

		expect(meterOf({ state })).toEqual({ granted: 500, balance: 500 });
	});

	test("a repeated set id is a duplicate and does not re-install the balance", () => {
		const set = makeEvent({ id: "evt_1", type: "set", value: 1000 });
		const installed = applyEvent({ state: createMeterState(), event: set });
		const spent = applyEvent({
			state: installed.state,
			event: makeEvent({ id: "evt_2", type: "deduct", value: 13 }),
		});
		const replay = applyEvent({ state: spent.state, event: set });

		expect(replay.result).toBe("duplicate");
		expect(canonicalSerialize({ state: replay.state })).toBe(
			canonicalSerialize({ state: spent.state }),
		);
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

	test("the same customer and feature ids stay isolated by org and env", () => {
		let state = createMeterState();
		for (const event of [
			makeEvent({ id: "evt_1", type: "grant", value: 10 }),
			makeEvent({
				id: "evt_2",
				type: "grant",
				value: 20,
				orgId: "org_2",
			}),
			makeEvent({
				id: "evt_3",
				type: "grant",
				value: 30,
				env: "live",
			}),
		]) {
			state = applyEvent({ state, event }).state;
		}

		expect(meterOf({ state })).toEqual({ granted: 10, balance: 10 });
		expect(meterOf({ state, orgId: "org_2" })).toEqual({
			granted: 20,
			balance: 20,
		});
		expect(meterOf({ state, env: "live" })).toEqual({
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
