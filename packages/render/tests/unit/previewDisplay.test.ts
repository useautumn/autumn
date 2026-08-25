import { describe, expect, test } from "bun:test";
import { buildBillingPreviewDisplay } from "../../src/billing/previewDisplay.js";

const phaseChange = (name: string, planId: string) => ({
	plan: { name },
	plan_id: planId,
});

describe("buildBillingPreviewDisplay changes", () => {
	test("a plan repeated across schedule phases renders once", () => {
		const display = buildBillingPreviewDisplay({
			preview: {
				currency: "usd",
				incoming: [
					phaseChange("Transactional Pro", "transactional_pro"),
					phaseChange("Transactional Pro", "transactional_pro"),
					phaseChange("Transactional Pro", "transactional_pro"),
				],
				outgoing: [phaseChange("Transactional Free", "transactional_free")],
			},
		});
		expect(display.changes.incoming).toEqual([
			{ name: "Transactional Pro", planId: "transactional_pro" },
		]);
		expect(display.changes.summaryText).toBe(
			"Attaching Transactional Pro and removing Transactional Free",
		);
	});

	test("distinct plans all render", () => {
		const display = buildBillingPreviewDisplay({
			preview: {
				currency: "usd",
				incoming: [
					phaseChange("Pro", "pro"),
					phaseChange("Starter", "starter"),
				],
				outgoing: [],
			},
		});
		expect(display.changes.summaryText).toBe("Attaching Pro, Starter");
	});
});
