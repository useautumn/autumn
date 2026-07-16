import { describe, expect, test } from "bun:test";
import type { SharedContext } from "../../../../types/sharedContext";
import { AttachParamsV0Schema } from "../../attachV2/attachParamsV0";
import { UpdateSubscriptionV0ParamsSchema } from "../../updateSubscription/updateSubscriptionV0Params";
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
