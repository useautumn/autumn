import { describe, expect, test } from "bun:test";
import {
	meteringEventSchema,
	parseMeteringEvent,
} from "@/internal/metering/events/meteringEventSchema.js";

const validInput = {
	v: 1,
	id: "evt_1",
	type: "deduct",
	org_id: "org_1",
	env: "sandbox",
	customer_id: "cus_1",
	feature_id: "messages",
	value: 5,
	event_ts: 1_700_000_000_000,
};

describe("metering event schema v1", () => {
	test("parses a valid envelope", () => {
		const event = parseMeteringEvent({ input: validInput });

		expect(event).toMatchObject({
			v: 1,
			id: "evt_1",
			type: "deduct",
			org_id: "org_1",
			env: "sandbox",
			customer_id: "cus_1",
			feature_id: "messages",
			value: 5,
			event_ts: 1_700_000_000_000,
		});
		expect(event.entity_id).toBeUndefined();
	});

	test("accepts every event type and an optional entity_id", () => {
		for (const type of ["deduct", "grant", "set", "reset"] as const) {
			const event = parseMeteringEvent({
				input: { ...validInput, type, entity_id: "ent_1" },
			});
			expect(event.type).toBe(type);
			expect(event.entity_id).toBe("ent_1");
		}
	});

	test("rejects an unknown type", () => {
		expect(() =>
			parseMeteringEvent({ input: { ...validInput, type: "refund" } }),
		).toThrow();
		expect(
			meteringEventSchema.safeParse({ ...validInput, type: "refund" }).success,
		).toBe(false);
	});

	test("rejects a non-positive value for the types that move a meter", () => {
		for (const type of ["deduct", "grant", "reset"] as const) {
			for (const value of [0, -1, -0.5]) {
				expect(
					meteringEventSchema.safeParse({ ...validInput, type, value }).success,
				).toBe(false);
			}
		}
	});

	test("a set may install a zero balance", () => {
		// A set carries a post-state, not an amount, and zero is a real balance
		// a fresh grant-then-full-spend leaves behind.
		const event = parseMeteringEvent({
			input: { ...validInput, type: "set", value: 0 },
		});

		expect(event.type).toBe("set");
		expect(event.value).toBe(0);
	});

	test("a set still rejects a negative balance", () => {
		for (const value of [-1, -0.5]) {
			expect(
				meteringEventSchema.safeParse({ ...validInput, type: "set", value })
					.success,
			).toBe(false);
		}
	});

	test("rejects missing or empty ids", () => {
		for (const field of ["id", "org_id", "customer_id", "feature_id"]) {
			const missing: Record<string, unknown> = { ...validInput };
			delete missing[field];
			expect(meteringEventSchema.safeParse(missing).success).toBe(false);

			expect(
				meteringEventSchema.safeParse({ ...validInput, [field]: "" }).success,
			).toBe(false);
		}
	});

	test("rejects a version other than 1", () => {
		expect(meteringEventSchema.safeParse({ ...validInput, v: 2 }).success).toBe(
			false,
		);
	});

	test("rejects a non-integer event_ts", () => {
		expect(
			meteringEventSchema.safeParse({ ...validInput, event_ts: 1.5 }).success,
		).toBe(false);
	});
});
