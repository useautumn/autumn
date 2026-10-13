import { describe, expect, test } from "bun:test";
import {
	AffectedResource,
	ApiVersion,
	ApiVersionClass,
	applyRequestVersionChanges,
	BatchTrackItemSchema,
	type BatchTrackParams,
	BatchTrackParamsV2_4Schema,
	type BatchTrackTokensParams,
	BatchTrackTokensParamsSchema,
	BatchTrackTokensParamsV2_4Schema,
	LATEST_VERSION,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const item = { customer_id: "cus_1", feature_id: "messages" };

describe("batch track item async", () => {
	test("2.5 items have no async field", () => {
		expect(Object.keys(BatchTrackItemSchema.shape)).not.toContain("async");
	});

	test("2.4 items still accept async, and upgrading drops it", () => {
		const parsed = BatchTrackParamsV2_4Schema.parse([{ ...item, async: true }]);
		expect(parsed).toEqual([{ ...item, async: true }]);

		const upgraded = applyRequestVersionChanges<BatchTrackParams>({
			input: parsed,
			fromVersion: new ApiVersionClass(ApiVersion.V2_4),
			toVersion: new ApiVersionClass(LATEST_VERSION),
			resource: AffectedResource.BatchTrack,
			ctx: { features: [] } as unknown as AutumnContext,
		});
		expect(upgraded).toEqual([item]);
	});
});

describe("batch track_tokens item async", () => {
	const tokensItem = {
		customer_id: "cus_1",
		model_id: "openai/gpt-4.1",
		input_tokens: 1,
		output_tokens: 1,
	};

	test("2.5 items have no async field", () => {
		expect(
			Object.keys(BatchTrackTokensParamsSchema.element.shape),
		).not.toContain("async");
	});

	test("2.4 items still accept async, and upgrading drops it", () => {
		const parsed = BatchTrackTokensParamsV2_4Schema.parse([
			{ ...tokensItem, async: true },
		]);
		const upgraded = applyRequestVersionChanges<BatchTrackTokensParams>({
			input: parsed,
			fromVersion: new ApiVersionClass(ApiVersion.V2_4),
			toVersion: new ApiVersionClass(LATEST_VERSION),
			resource: AffectedResource.BatchTrackTokens,
			ctx: { features: [] } as unknown as AutumnContext,
		});
		expect(upgraded).toEqual([tokensItem]);
	});
});
