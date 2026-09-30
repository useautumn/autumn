import { expect, test } from "bun:test";
import { createRouteHints } from "../src/routing/createRouteHints.js";

const known = { partition: 3, routeEpoch: "10", endpoint: "http://worker-a" };
const later = { partition: 3, routeEpoch: "12", endpoint: "http://worker-b" };

test("a hint is kept only when it is newer than what ownership already says, and expires on its own", () => {
	let now = 1_000;
	const hints = createRouteHints({ now: () => now, ttlMs: 500 });
	expect(hints.adopt({ successor: known, known })).toBe(false);
	expect(hints.adopt({ successor: later, known })).toBe(true);
	expect(hints.find({ partition: 3 })).toEqual(later);
	// An older hint never replaces a newer one already held.
	expect(
		hints.adopt({ successor: { ...later, routeEpoch: "11" }, known }),
	).toBe(false);
	expect(hints.find({ partition: 3 })).toEqual(later);
	now += 500;
	expect(hints.find({ partition: 3 })).toBeUndefined();
});

test("dropping forgets a hint only when the endpoint it named is the one that declined", () => {
	const hints = createRouteHints({ now: () => 0 });
	expect(hints.adopt({ successor: later })).toBe(true);
	hints.drop({ partition: 3, endpoint: "http://worker-z" });
	expect(hints.find({ partition: 3 })).toEqual(later);
	hints.drop({ partition: 3, endpoint: "http://worker-b" });
	expect(hints.find({ partition: 3 })).toBeUndefined();
});
