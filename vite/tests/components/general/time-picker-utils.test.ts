import { describe, expect, test } from "bun:test";
import {
	getArrowByType,
	getDateByType,
	setDateByType,
} from "@/components/general/timePickerUtils";

describe("timePickerUtils seconds support", () => {
	test("setDateByType sets seconds when type is seconds", () => {
		const date = new Date("2026-01-01T10:15:20.000Z");

		const updatedDate = setDateByType({
			date,
			value: "45",
			type: "seconds",
		});

		expect(updatedDate.getSeconds()).toBe(45);
	});

	test("setDateByType clamps invalid seconds values", () => {
		const date = new Date("2026-01-01T10:15:20.000Z");

		const updatedDate = setDateByType({
			date,
			value: "99",
			type: "seconds",
		});

		expect(updatedDate.getSeconds()).toBe(59);
	});

	test("getDateByType returns zero-padded seconds", () => {
		const date = new Date("2026-01-01T10:15:07.000Z");

		const value = getDateByType({
			date,
			type: "seconds",
		});

		expect(value).toBe("07");
	});

	test("getArrowByType wraps forward and backward for seconds", () => {
		const incremented = getArrowByType({
			value: "59",
			step: 1,
			type: "seconds",
		});
		const decremented = getArrowByType({
			value: "00",
			step: -1,
			type: "seconds",
		});

		expect(incremented).toBe("00");
		expect(decremented).toBe("59");
	});
});
