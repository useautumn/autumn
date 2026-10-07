import { describe, expect, test } from "bun:test";
import { roundEta, smoothFinishAt } from "./smoothEta.ts";

const NOW = 1_000_000;

describe("smoothFinishAt", () => {
	test("the first estimate is shown as is", () => {
		expect(
			smoothFinishAt({ shownFinishAt: null, etaMs: 60_000, now: NOW }),
		).toBe(NOW + 60_000);
	});

	test("a jump is capped at 20% of what is shown", () => {
		const shownFinishAt = NOW + 100_000;
		expect(
			smoothFinishAt({ shownFinishAt, etaMs: 300_000, now: NOW }) - NOW,
		).toBe(120_000);
		expect(
			smoothFinishAt({ shownFinishAt, etaMs: 10_000, now: NOW }) - NOW,
		).toBe(80_000);
		expect(
			smoothFinishAt({ shownFinishAt, etaMs: 110_000, now: NOW }) - NOW,
		).toBe(110_000);
	});

	test("an ETA that counted down to zero can still grow by a few seconds", () => {
		expect(
			smoothFinishAt({ shownFinishAt: NOW - 1_000, etaMs: 60_000, now: NOW }) -
				NOW,
		).toBe(5_000);
	});
});

test("roundEta gets coarser as the ETA grows", () => {
	expect(roundEta(1_000)).toBe(5_000);
	expect(roundEta(62_000)).toBe(60_000);
	expect(roundEta(250_000)).toBe(255_000);
	expect(roundEta(1_000_000)).toBe(1_020_000);
});
