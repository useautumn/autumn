import { describe, expect, test } from "bun:test";
import { TrackParamsSchema } from "@api/balances/track/trackParams";
import { TrackTokensParamsSchema } from "@api/balances/track/trackTokensParams";

const schemaCases = [
	[
		"track",
		TrackParamsSchema,
		{ customer_id: "cus_123", feature_id: "messages" },
	],
	[
		"track_tokens",
		TrackTokensParamsSchema,
		{
			customer_id: "cus_123",
			feature_id: "ai_credits",
			model_id: "openai/gpt-4.1",
			input_tokens: 100,
			output_tokens: 50,
		},
	],
] as const;

describe("track timestamp schemas", () => {
	test.each(schemaCases)(
		"%s accepts omitted and historical timestamps",
		(_, schema, params) => {
			expect(schema.safeParse(params).success).toBe(true);
			expect(
				schema.safeParse({
					...params,
					timestamp: Date.UTC(2024, 0, 15, 12, 30, 0),
				}).success,
			).toBe(true);
		},
	);

	test.each(schemaCases)(
		"%s rejects malformed numeric timestamps",
		(_, schema, params) => {
			for (const timestamp of [
				0,
				-1,
				1_775_123_200_000.5,
				Number.NaN,
				Infinity,
				Number.MAX_SAFE_INTEGER + 1,
			]) {
				expect(
					schema.safeParse({
						...params,
						timestamp,
					}).success,
				).toBe(false);
			}
		},
	);

	test.each(schemaCases)(
		"%s rejects future timestamps",
		(_, schema, params) => {
			expect(
				schema.safeParse({
					...params,
					timestamp: Date.now() + 1000,
				}).success,
			).toBe(false);
		},
	);
});
