import { describe, expect, test } from "bun:test";
import type { MeteringEvent } from "@/internal/metering/events/meteringEventSchema.js";
import { applyEvent } from "@/internal/metering/fold/applyEvent.js";
import { canonicalSerialize } from "@/internal/metering/fold/canonicalSerialize.js";
import {
	createMeterState,
	type MeterState,
} from "@/internal/metering/fold/meterState.js";
import { generateEvents, makeEvent } from "./metering-test-fixtures.js";

const fold = ({ events }: { events: MeteringEvent[] }): MeterState => {
	let state = createMeterState();
	for (const event of events) state = applyEvent({ state, event }).state;
	return state;
};

describe("canonicalSerialize", () => {
	test("folding the same sequence twice yields identical bytes", () => {
		const events = generateEvents({ count: 500, seed: 7 });

		expect(canonicalSerialize({ state: fold({ events }) })).toBe(
			canonicalSerialize({ state: fold({ events }) }),
		);
	});

	test("serialization is independent of key insertion order", () => {
		const forward = fold({
			events: [
				makeEvent({ id: "evt_1", type: "grant", value: 10, customerId: "b" }),
				makeEvent({ id: "evt_2", type: "grant", value: 20, customerId: "a" }),
				makeEvent({
					id: "evt_3",
					type: "grant",
					value: 30,
					customerId: "a",
					featureId: "zeta",
				}),
			],
		});
		const reversed = fold({
			events: [
				makeEvent({
					id: "evt_3",
					type: "grant",
					value: 30,
					customerId: "a",
					featureId: "zeta",
				}),
				makeEvent({ id: "evt_2", type: "grant", value: 20, customerId: "a" }),
				makeEvent({ id: "evt_1", type: "grant", value: 10, customerId: "b" }),
			],
		});

		const customersOf = (state: MeterState) =>
			JSON.stringify(JSON.parse(canonicalSerialize({ state })).customers);

		expect(customersOf(forward)).toBe(customersOf(reversed));
	});

	test("object keys are emitted in sorted order", () => {
		const state = fold({
			events: [
				makeEvent({ id: "evt_1", type: "grant", value: 1, customerId: "zz" }),
				makeEvent({ id: "evt_2", type: "grant", value: 1, customerId: "aa" }),
			],
		});
		const serialized = canonicalSerialize({ state });

		expect(serialized.indexOf('"aa"')).toBeLessThan(serialized.indexOf('"zz"'));
		expect(serialized.indexOf('"balance"')).toBeLessThan(
			serialized.indexOf('"granted"'),
		);
		expect(serialized.indexOf('"customers"')).toBeLessThan(
			serialized.indexOf('"dedupe"'),
		);
	});

	test("the dedupe window keeps insertion order, not sorted order", () => {
		const state = fold({
			events: [
				makeEvent({ id: "evt_b", type: "grant", value: 1 }),
				makeEvent({ id: "evt_a", type: "grant", value: 1 }),
			],
		});

		expect(JSON.parse(canonicalSerialize({ state })).dedupe.ids).toEqual([
			"evt_b",
			"evt_a",
		]);
	});

	test("round-tripping through JSON preserves the exact bytes", () => {
		const state = fold({ events: generateEvents({ count: 200, seed: 11 }) });
		const serialized = canonicalSerialize({ state });

		expect(canonicalSerialize({ state: JSON.parse(serialized) })).toBe(
			serialized,
		);
	});
});
