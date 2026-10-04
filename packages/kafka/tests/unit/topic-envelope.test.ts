/**
 * A record's envelope is written without building the envelope object, and its key bytes are shared across
 * records of one customer. The bytes on the log must not move.
 */

import { describe, expect, test } from "bun:test";
import { serializeTopicRecord } from "../../src/lib/topicEnvelope.js";

const seededRandom = (seed: number) => {
	let value = seed;
	return () => {
		value = (value + 0x6d2b79f5) | 0;
		let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
	};
};

const randomValue = (random: () => number, depth: number): unknown => {
	const roll = random();
	if (depth > 3 || roll < 0.3) return Math.floor(random() * 2_000) - 1_000;
	if (roll < 0.45) return random() < 0.5 ? null : random() < 0.5;
	if (roll < 0.6) return `s"\\${Math.floor(random() * 99)}\u2028é`;
	if (roll < 0.7) return random() * 1e6;
	if (roll < 0.8)
		return Array.from({ length: Math.floor(random() * 4) }, () =>
			randomValue(random, depth + 1),
		);
	const object: Record<string, unknown> = {};
	for (let index = 0; index < Math.floor(random() * 5); index++)
		object[`k${index}`] =
			random() < 0.1 ? undefined : randomValue(random, depth + 1);
	return object;
};

describe("topic record envelope", () => {
	test("writes exactly the bytes the envelope object would stringify to", () => {
		const random = seededRandom(3);
		for (let n = 0; n < 2_000; n++) {
			const record = {
				type: random() < 0.5 ? "mutation" : `t"${n}`,
				...(randomValue(random, 0) as object),
			};
			const key = JSON.stringify(["org_1", "sandbox", `cus_${n % 7}`]);
			const { key: keyBytes, value } = serializeTopicRecord({ key, record });
			expect(value.toString("utf8")).toBe(
				JSON.stringify({
					schemaVersion: 1,
					type: record.type,
					payload: record,
				}),
			);
			expect(keyBytes.toString("utf8")).toBe(key);
		}
	});
});
