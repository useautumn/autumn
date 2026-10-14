import { describe, expect, test } from "bun:test";
import {
	AffectedResource,
	ApiVersion,
	ApiVersionClass,
	applyRequestVersionChanges,
	type FinalizeLockParamsV0,
	FinalizeLockParamsV0Schema,
	LATEST_VERSION,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const toLatest = ({
	input,
	fromVersion,
}: {
	input: FinalizeLockParamsV0;
	fromVersion: ApiVersion;
}) =>
	applyRequestVersionChanges<FinalizeLockParamsV0>({
		input,
		fromVersion: new ApiVersionClass(fromVersion),
		toVersion: new ApiVersionClass(LATEST_VERSION),
		resource: AffectedResource.FinalizeLock,
		ctx: { features: [] } as unknown as AutumnContext,
	});

const body: FinalizeLockParamsV0 = {
	lock_id: "lock_1",
	action: "confirm",
	customer_id: "cus_1",
};

describe("V2_5_FinalizeLockParamsChange", () => {
	test("a finalize names its customer from 2.6; the schema reads it with or without one", () => {
		expect(toLatest({ input: body, fromVersion: ApiVersion.V2_6 })).toEqual(
			body,
		);
		expect(FinalizeLockParamsV0Schema.parse(body)).toEqual(body);
		expect(
			FinalizeLockParamsV0Schema.parse({
				lock_id: "lock_1",
				action: "confirm",
			}),
		).toEqual({ lock_id: "lock_1", action: "confirm" });
	});

	test("2.5 and older never name one: a customer_id they send is dropped", () => {
		for (const fromVersion of [ApiVersion.V2_5, ApiVersion.V2_1]) {
			expect(toLatest({ input: body, fromVersion })).toEqual({
				lock_id: "lock_1",
				action: "confirm",
			});
		}
	});
});
