import { expect, test } from "bun:test";
import { shortStripeId } from "@/components/forms/create-schedule/utils/review/shortStripeId";

test("short Stripe ids keep the prefix and tail", () => {
	expect(shortStripeId("sub_1Q2wXcAutumnDemo")).toBe("sub_…mnDemo");
	expect(shortStripeId("sub_1")).toBe("sub_1");
});
