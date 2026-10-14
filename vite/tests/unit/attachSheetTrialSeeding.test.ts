import { describe, expect, test } from "bun:test";
import { attachFormOverridesFromRequestBody } from "../../src/components/forms/attach-v2/utils/attachFormOverridesFromRequestBody";
import { updateSubscriptionFormOverridesFromRequestBody } from "../../src/components/forms/update-subscription-v2/utils/updateSubscriptionFormOverridesFromRequestBody";

const trial = {
	card_required: true,
	duration_length: 14,
	duration_type: "day",
};

describe("attach sheet trial seeding", () => {
	test("seeds a trial sent at the top level", () => {
		expect(
			attachFormOverridesFromRequestBody({
				plan_id: "scale",
				free_trial: trial,
			}),
		).toMatchObject({ trialEnabled: true, trialLength: 14 });
	});

	test("seeds a trial sent inside customize", () => {
		expect(
			attachFormOverridesFromRequestBody({
				plan_id: "scale",
				customize: { free_trial: trial },
			}),
		).toMatchObject({ trialEnabled: true, trialLength: 14 });
	});

	test("the V0 field names still seed, for stored cards", () => {
		expect(
			attachFormOverridesFromRequestBody({
				plan_id: "scale",
				free_trial: { card_required: true, length: 14, duration: "day" },
			}),
		).toMatchObject({ trialEnabled: true, trialLength: 14 });
	});

	test("the update sheet seeds a trial from either shape", () => {
		expect(
			updateSubscriptionFormOverridesFromRequestBody({
				plan_id: "scale",
				customize: { free_trial: trial },
			}),
		).toMatchObject({ trialEnabled: true, trialLength: 14 });
	});

	test("a request with no trial leaves the toggle alone", () => {
		expect(
			attachFormOverridesFromRequestBody({ plan_id: "scale" }),
		).not.toMatchObject({ trialEnabled: true });
	});
});
