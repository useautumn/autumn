import { describe, expect, test } from "bun:test";
import { FreeTrialDuration, freeTrialsAreSame } from "@autumn/shared";

const base = {
	length: 14,
	unique_fingerprint: false,
	duration: FreeTrialDuration.Day,
	card_required: true,
	on_end: "bill" as const,
};

describe("freeTrialsAreSame", () => {
	test("both null/undefined → same", () => {
		expect(freeTrialsAreSame({ ft1: null, ft2: null })).toBe(true);
		expect(freeTrialsAreSame({ ft1: undefined, ft2: undefined })).toBe(true);
		expect(freeTrialsAreSame({ ft1: null, ft2: undefined })).toBe(true);
	});

	test("one null → different", () => {
		expect(freeTrialsAreSame({ ft1: base, ft2: null })).toBe(false);
		expect(freeTrialsAreSame({ ft1: null, ft2: base })).toBe(false);
	});

	test("length difference → different", () => {
		expect(
			freeTrialsAreSame({
				ft1: base,
				ft2: { ...base, length: 7 },
			}),
		).toBe(false);
	});

	test("duration difference → different", () => {
		expect(
			freeTrialsAreSame({
				ft1: base,
				ft2: { ...base, duration: FreeTrialDuration.Month },
			}),
		).toBe(false);
	});

	test("card_required difference → different", () => {
		expect(
			freeTrialsAreSame({
				ft1: base,
				ft2: { ...base, card_required: false },
			}),
		).toBe(false);
	});

	test("on_end: undefined ≡ null ≡ bill → same", () => {
		expect(
			freeTrialsAreSame({
				ft1: { ...base, on_end: undefined },
				ft2: { ...base, on_end: null },
			}),
		).toBe(true);
		expect(
			freeTrialsAreSame({
				ft1: { ...base, on_end: undefined },
				ft2: { ...base, on_end: "bill" },
			}),
		).toBe(true);
		expect(
			freeTrialsAreSame({
				ft1: { ...base, on_end: null },
				ft2: { ...base, on_end: "bill" },
			}),
		).toBe(true);
	});

	test("on_end: revert vs bill/omitted → different", () => {
		expect(
			freeTrialsAreSame({
				ft1: { ...base, on_end: "revert" },
				ft2: { ...base, on_end: "bill" },
			}),
		).toBe(false);
		expect(
			freeTrialsAreSame({
				ft1: { ...base, on_end: "revert" },
				ft2: { ...base, on_end: undefined },
			}),
		).toBe(false);
	});

	test("unique_fingerprint difference → different", () => {
		expect(
			freeTrialsAreSame({
				ft1: base,
				ft2: { ...base, unique_fingerprint: true },
			}),
		).toBe(false);
	});

	test("identical fields → same", () => {
		expect(freeTrialsAreSame({ ft1: base, ft2: { ...base } })).toBe(true);
	});
});
