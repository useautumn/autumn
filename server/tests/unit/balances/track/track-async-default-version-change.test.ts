import { describe, expect, test } from "bun:test";
import {
	AffectedResource,
	ApiVersion,
	ApiVersionClass,
	applyRequestVersionChanges,
	LATEST_VERSION,
	type TrackParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const toLatest = ({
	input,
	fromVersion,
}: {
	input: TrackParams;
	fromVersion: ApiVersion;
}) =>
	applyRequestVersionChanges<TrackParams>({
		input,
		fromVersion: new ApiVersionClass(fromVersion),
		toVersion: new ApiVersionClass(LATEST_VERSION),
		resource: AffectedResource.Track,
		ctx: { features: [] } as unknown as AutumnContext,
	});

const body: TrackParams = { customer_id: "cus_1", feature_id: "messages" };

describe("V2_4_TrackParamsChange", () => {
	test("an omitted async stays sync for V2.4 and older", () => {
		for (const fromVersion of [
			ApiVersion.V2_4,
			ApiVersion.V2_1,
			ApiVersion.V1_2,
		]) {
			expect(toLatest({ input: body, fromVersion }).async).toBe(false);
		}
	});

	test("an explicit async passes through for V2.4", () => {
		expect(
			toLatest({
				input: { ...body, async: true },
				fromVersion: ApiVersion.V2_4,
			}).async,
		).toBe(true);
		expect(
			toLatest({
				input: { ...body, async: false },
				fromVersion: ApiVersion.V2_4,
			}).async,
		).toBe(false);
	});
});
