import { expect, test } from "bun:test";
import { editSubscriptionLabel } from "@/views/customers2/components/sheets/set-plans-subscription/utils/editSubscriptionLabel";

test("names up to two plans, then counts the rest", () => {
	expect(
		[[], ["Pro"], ["Pro", "Credits"], ["Pro", "Credits", "Seats"]].map(
			(planNames) => editSubscriptionLabel({ planNames }),
		),
	).toEqual([
		"Edit subscription",
		"Edit Pro",
		"Edit Pro + Credits",
		"Edit Pro + 2 more",
	]);
});
