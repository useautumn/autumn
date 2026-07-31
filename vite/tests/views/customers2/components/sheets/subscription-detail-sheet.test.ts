// Before: $1,050 rendered as 10.5. After: API major units display unchanged.
import { expect, test } from "bun:test";
import {
	type ApiDiscount,
	CouponDurationType,
	RewardType,
} from "@autumn/shared";
import { formatDiscountLabel } from "@/views/customers2/components/sheets/subscriptionDetailUtils";

test("formats fixed subscription discounts in major currency units", () => {
	const discount = {
		id: "alludium",
		name: "alludium",
		type: RewardType.FixedDiscount,
		discount_value: 1050,
		currency: "usd",
		duration_type: CouponDurationType.Forever,
	} as ApiDiscount;

	expect(formatDiscountLabel({ discount })).toBe("alludium (1050 USD off)");
});
