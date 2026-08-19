import { describe, expect, test } from "bun:test";
import type { FullProduct, Price } from "@autumn/shared";
import { hydratePlanLicenseProcessor } from "@/internal/catalogV2/execute/executeInitStripeResources/hydratePlanLicenseProcessor";

const licensePrice = ({
	id,
	isCustom,
	isFixed,
}: {
	id: string;
	isCustom: boolean;
	isFixed: boolean;
}): Price =>
	({
		id,
		is_custom: isCustom,
		config: isFixed
			? { type: "fixed", amount: 10, stripe_price_id: null }
			: { type: "usage", stripe_price_id: null },
	}) as unknown as Price;

describe("plan license stripe init helpers", () => {
	test("hydratePlanLicenseProcessor copies the live child's processor onto the clone", () => {
		const child = {
			internal_id: "seat_v1",
			processor: { type: "stripe", id: "prod_seat" },
			prices: [],
			entitlements: [],
			licenses: [],
		} as unknown as FullProduct;
		const licenseProduct = {
			internal_id: "seat_v1",
			processor: null,
			prices: [
				licensePrice({ id: "custom_usage", isCustom: true, isFixed: false }),
			],
			entitlements: [],
			licenses: [],
		} as unknown as FullProduct;
		const parent = {
			internal_id: "team_v1",
			processor: null,
			prices: [],
			entitlements: [],
			licenses: [{ product: licenseProduct }],
		} as unknown as FullProduct;

		hydratePlanLicenseProcessor({
			product: parent,
			catalogByInternalId: new Map([["seat_v1", child]]),
		});

		expect(licenseProduct.processor).toEqual({
			type: "stripe",
			id: "prod_seat",
		});
	});
});
