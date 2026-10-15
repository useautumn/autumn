import { describe, expect, test } from "bun:test";
import {
	editNumberInput,
	formatNumberInput,
	sanitizeNumberInput,
} from "@/utils/formatUtils/formatNumberInputUtils";

describe("sanitizeNumberInput", () => {
	test("strips commas, spaces and currency symbols", () => {
		expect(sanitizeNumberInput({ text: "70,000,000" })).toBe("70000000");
		expect(sanitizeNumberInput({ text: "$1,500.50" })).toBe("1500.50");
		expect(sanitizeNumberInput({ text: " 12 345 " })).toBe("12345");
	});

	test("keeps only the first decimal point and drops minus signs", () => {
		expect(sanitizeNumberInput({ text: "1.2.3" })).toBe("1.23");
		expect(sanitizeNumberInput({ text: "-5" })).toBe("5");
	});
});

describe("formatNumberInput", () => {
	test("groups the integer part with commas", () => {
		expect(formatNumberInput({ raw: "70000000" })).toBe("70,000,000");
		expect(formatNumberInput({ raw: "1234.5678" })).toBe("1,234.5678");
		expect(formatNumberInput({ raw: "999" })).toBe("999");
	});

	test("keeps leading zeros, trailing points and empty input", () => {
		expect(formatNumberInput({ raw: "0000000" })).toBe("0,000,000");
		expect(formatNumberInput({ raw: "12." })).toBe("12.");
		expect(formatNumberInput({ raw: "" })).toBe("");
	});

	test("leaves non-plain values alone", () => {
		expect(formatNumberInput({ raw: "∞" })).toBe("∞");
		expect(formatNumberInput({ raw: "1e-7" })).toBe("1e-7");
	});
});

describe("editNumberInput", () => {
	test("pasting a comma-separated number keeps its value", () => {
		const edit = editNumberInput({
			text: "70,000,000",
			caret: 10,
			previousRaw: "",
			inputType: "insertFromPaste",
		});
		expect(edit).toEqual({
			raw: "70000000",
			formatted: "70,000,000",
			caret: 10,
		});
	});

	test("deleting the leading digit keeps the remaining zeros", () => {
		const edit = editNumberInput({
			text: "0,000,000",
			caret: 0,
			previousRaw: "70000000",
			inputType: "deleteContentBackward",
		});
		expect(edit).toEqual({ raw: "0000000", formatted: "0,000,000", caret: 0 });
	});

	test("typing keeps the caret after the typed digit as commas shift", () => {
		const edit = editNumberInput({
			text: "1,9234",
			caret: 3,
			previousRaw: "1234",
			inputType: "insertText",
		});
		expect(edit).toEqual({ raw: "19234", formatted: "19,234", caret: 2 });
	});

	test("backspace on a comma removes the digit before it", () => {
		const edit = editNumberInput({
			text: "70000,000",
			caret: 2,
			previousRaw: "70000000",
			inputType: "deleteContentBackward",
		});
		expect(edit).toEqual({ raw: "7000000", formatted: "7,000,000", caret: 1 });
	});

	test("forward delete on a comma removes the digit after it", () => {
		const edit = editNumberInput({
			text: "70000,000",
			caret: 2,
			previousRaw: "70000000",
			inputType: "deleteContentForward",
		});
		expect(edit).toEqual({ raw: "7000000", formatted: "7,000,000", caret: 3 });
	});
});
