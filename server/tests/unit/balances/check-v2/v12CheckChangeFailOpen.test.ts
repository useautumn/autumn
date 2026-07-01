/**
 * TDD test for the Redis fail-open denial bug on legacy (1.x) API versions.
 *
 * When Redis is not_ready, /check returns the fail-open fallback
 * (allowed: true, balance: null). V1_2_CheckChange.transformResponse then runs
 * for 1.x customers and, seeing a null balance, hardcoded allowed: false —
 * wrongfully denying customers who were never actually out of balance.
 *
 * Red-failure mode (current behavior):
 *  - input { allowed: true, balance: null } → output { allowed: false }
 *
 * Green-success criteria (after fix):
 *  - allowed carries over: input.allowed === true with null balance stays allowed: true
 */

import { describe, expect, test } from "bun:test";
import type {
	CheckResponseV1,
	CheckResponseV2,
	Feature,
} from "@autumn/shared";
import { V1_2_CheckChange } from "@autumn/shared/api/balances/check/changes/V1.2_CheckChange";
import { FeatureType } from "@autumn/shared";

const featureToUse = {
	id: "google_drive_asset_ingest",
	type: FeatureType.Metered,
} as Feature;

describe("V1_2_CheckChange fail-open", () => {
	test("carries over allowed: true when balance is null (Redis fail-open)", () => {
		const transform = new V1_2_CheckChange();
		const input: CheckResponseV2 = {
			allowed: true,
			customer_id: "cus_mosaic",
			entity_id: undefined,
			required_balance: 1,
			balance: null,
		};

		const transformed = transform.transformResponse({
			input,
			legacyData: { noCusEnts: false, featureToUse },
		}) as CheckResponseV1;

		expect(transformed.allowed).toBe(true);
		expect(transformed.feature_id).toBe("google_drive_asset_ingest");
		expect(transformed.required_balance).toBe(1);
	});

	test("still denies when balance is null and allowed is false", () => {
		const transform = new V1_2_CheckChange();
		const input: CheckResponseV2 = {
			allowed: false,
			customer_id: "cus_mosaic",
			entity_id: undefined,
			required_balance: 1,
			balance: null,
		};

		const transformed = transform.transformResponse({
			input,
			legacyData: { noCusEnts: false, featureToUse },
		}) as CheckResponseV1;

		expect(transformed.allowed).toBe(false);
	});
});
