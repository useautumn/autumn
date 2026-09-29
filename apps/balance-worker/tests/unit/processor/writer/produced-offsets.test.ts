import { expect, test } from "bun:test";
import { createProducedOffsets } from "../../../../src/processor/writer/producedOffsets/createProducedOffsets.js";

test("remembers what this writer produced and forgets it once the consumer has passed", () => {
	const produced = createProducedOffsets();
	produced.remember({ from: 10n, to: 12n });
	produced.remember({ from: 13n, to: 13n });
	produced.remember({ from: 20n, to: 21n });
	// Adjacent ranges merge, so a busy partition keeps one range, not one per batch.
	expect(produced.size()).toBe(2);

	expect(produced.has({ offset: 9n })).toBe(false);
	expect(produced.has({ offset: 10n })).toBe(true);
	expect(produced.has({ offset: 13n })).toBe(true);
	// A record between two of our batches came from elsewhere: read it.
	expect(produced.has({ offset: 15n })).toBe(false);
	expect(produced.has({ offset: 21n })).toBe(true);
	// Asking past a range drops it; the structure never grows with the log.
	expect(produced.size()).toBe(1);
	expect(produced.has({ offset: 22n })).toBe(false);
	expect(produced.size()).toBe(0);
});

test("a fresh tracker owns nothing and refuses an inverted range", () => {
	const produced = createProducedOffsets();
	expect(produced.has({ offset: 0n })).toBe(false);
	expect(() => produced.remember({ from: 5n, to: 4n })).toThrow(RangeError);
});
