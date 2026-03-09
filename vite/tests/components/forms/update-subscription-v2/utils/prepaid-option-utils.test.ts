import { describe, expect, test } from "bun:test";
import { mergePrepaidOptionsByFeatureIdentity } from "@/components/forms/update-subscription-v2/utils/prepaidOptionUtils";

describe("mergePrepaidOptionsByFeatureIdentity", () => {
	test("should preserve quantities when feature_id changes but internal_id stays the same", () => {
		const result = mergePrepaidOptionsByFeatureIdentity({
			currentItems: [
				{
					feature_id: "messages_v1",
					feature: { internal_id: "int_messages" },
				},
			],
			currentPrepaidOptions: { messages_v1: 5000 },
			nextItems: [
				{
					feature_id: "messages_v2",
					feature: { internal_id: "int_messages" },
				},
			],
		});

		expect(result.nextPrepaidOptions).toEqual({
			messages_v1: 5000,
			messages_v2: 5000,
		});
		expect(result.didChange).toBe(true);
	});

	test("should seed zero only for genuinely new prepaid items", () => {
		const result = mergePrepaidOptionsByFeatureIdentity({
			currentItems: [],
			currentPrepaidOptions: {},
			nextItems: [{ feature_id: "tokens_v2" }],
		});

		expect(result.nextPrepaidOptions).toEqual({ tokens_v2: 0 });
		expect(result.didChange).toBe(true);
	});
});
