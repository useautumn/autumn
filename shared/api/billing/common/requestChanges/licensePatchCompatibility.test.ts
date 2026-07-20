import { describe, expect, test } from "bun:test";
import { V2_CHANGES } from "@autumn/shared";
import type { SharedContext } from "../../../../types/sharedContext";
import { AttachParamsV0Schema } from "../../attachV2/attachParamsV0";
import { UpdateSubscriptionV0ParamsSchema } from "../../updateSubscription/updateSubscriptionV0Params";
import { UpdateSubscriptionV1ParamsSchema } from "../../updateSubscription/updateSubscriptionV1Params";
import { billingParamsV0ToCustomizeV1 } from "../mappers/billingParamsV0ToCustomizeV1";

const ctx = {} as SharedContext;
const upsertLicenses = [
	{
		license_plan_id: "dev-seat",
		customize: { price: { amount: 40, interval: "month" as const } },
	},
];

describe("V1.2 license patch compatibility", () => {
	test("maps update upsert_licenses into customize", () => {
		const input = UpdateSubscriptionV0ParamsSchema.parse({
			customer_id: "customer-1",
			product_id: "pro",
			upsert_licenses: upsertLicenses,
		});

		const result = billingParamsV0ToCustomizeV1({
			ctx,
			billingParams: input,
		});

		expect(result?.upsert_licenses).toEqual(upsertLicenses);
	});

	test("propagates update license_quantities through the V0→V1 transform", () => {
		const updateParamsChange = V2_CHANGES.map(
			(ChangeClass) => new ChangeClass(),
		).find(
			(change) => change.name === "V1.2 Update Subscription Params Change",
		);
		if (!updateParamsChange) {
			throw new Error("V1.2 update subscription params change not registered");
		}

		const licenseQuantities = [{ license_plan_id: "dev-seat", quantity: 5 }];
		const input = UpdateSubscriptionV0ParamsSchema.parse({
			customer_id: "customer-1",
			product_id: "pro",
			license_quantities: licenseQuantities,
		});
		expect(input.license_quantities).toEqual(licenseQuantities);

		const transformed = updateParamsChange.transformRequest({ ctx, input });
		const reparsed = UpdateSubscriptionV1ParamsSchema.parse(transformed);
		expect(reparsed.license_quantities).toEqual(licenseQuantities);
	});

	test("maps attach upsert_licenses into customize", () => {
		const input = AttachParamsV0Schema.parse({
			customer_id: "customer-1",
			product_id: "pro",
			upsert_licenses: upsertLicenses,
		});

		const result = billingParamsV0ToCustomizeV1({
			ctx,
			billingParams: input,
		});

		expect(result?.upsert_licenses).toEqual(upsertLicenses);
	});
});
