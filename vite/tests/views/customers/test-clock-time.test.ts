import { expect, test } from "bun:test";
import { getTestClockTimeError } from "../../../src/views/customers2/customer/utils/getTestClockTimeError";

const frozenTime = Date.UTC(2026, 8, 17, 12);

test("test clock requires a selected finite time", () => {
	for (const target of [null, Number.NaN, Number.POSITIVE_INFINITY]) {
		expect(getTestClockTimeError({ frozenTime, target })).toBe(
			"Choose a date and time.",
		);
	}
});

test("test clock rejects earlier, unchanged, and same-second targets", () => {
	for (const target of [frozenTime - 1000, frozenTime, frozenTime + 999]) {
		expect(getTestClockTimeError({ frozenTime, target })).toBe(
			"Choose a time after the current clock time.",
		);
	}
});

test("test clock accepts a later second", () => {
	for (const target of [frozenTime + 1000, frozenTime + 86400000]) {
		expect(getTestClockTimeError({ frozenTime, target })).toBeUndefined();
	}
});
