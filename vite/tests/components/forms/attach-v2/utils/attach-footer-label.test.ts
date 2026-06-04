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
		).toBe("Preview Schedule");
	});

	test("future startDate takes precedence over checkout redirect", () => {
		expect(
			getConfirmLabel({
				previewData: {
					...previewData,
					redirect_to_checkout: true,
				},
				startDate: addDays(NOW, 1).getTime(),
				now: NOW,
			}),
		).toBe("Preview Schedule");
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

	test("backdated startDate with a card charges the customer", () => {
		expect(
			getConfirmLabel({
				previewData,
				startDate: addDays(NOW, -30).getTime(),
				now: NOW,
			}),
		).toBe("Charge Customer");
	});

	test("backdated startDate without a card generates a checkout URL", () => {
		expect(
			getConfirmLabel({
				previewData: {
					...previewData,
					redirect_to_checkout: true,
				},
				startDate: addDays(NOW, -30).getTime(),
				now: NOW,
			}),
		).toBe("Generate Checkout URL");
	});
});
