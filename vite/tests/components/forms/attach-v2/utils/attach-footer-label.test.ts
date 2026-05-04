import { describe, expect, test } from "bun:test";
import { addDays } from "date-fns";
import { getConfirmLabel } from "@/components/forms/attach-v2/components/AttachFooterV3";

const NOW = new Date("2026-04-30T10:00:00Z").getTime();

const previewData = {
	redirect_to_checkout: false,
	total: 20,
	outgoing: [],
};

describe("getConfirmLabel", () => {
	test("future startDate schedules instead of charging", () => {
		expect(
			getConfirmLabel({
				previewData,
				startDate: addDays(NOW, 1).getTime(),
				now: NOW,
			}),
		).toBe("Schedule Plan");
	});

	test("immediate paid attach charges customer", () => {
		expect(
			getConfirmLabel({
				previewData,
				startDate: null,
				now: NOW,
			}),
		).toBe("Charge Customer");
	});
});
