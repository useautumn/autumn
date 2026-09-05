/**
 * Which features setup loads state for. Pure function, so the regression —
 * a feature removed by omission must still be touched, or its preview row
 * reads has_customers/will_archive as false — is proven without a DB.
 *
 * Contract:
 *   B1  a feature explicitly listed in features[] is touched
 *   B2  a feature named in remove_features is touched
 *   B3  a feature dropped by omission under full state is touched
 *   B4  a feature nobody mentions when the payload has no opinion on features is not touched
 */

import { expect, test } from "bun:test";
import type { Feature, UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { paramsToTouchedFeatures } from "@/internal/catalogV2/actions/updateCatalog/utils/featureUpdateUtils/paramsToTouchedFeatures";

const feature = ({ id, internalId }: { id: string; internalId: string }) =>
	({ id, internal_id: internalId, archived: false }) as unknown as Feature;

const ctxWith = (features: Feature[]) =>
	({ features }) as unknown as AutumnContext;

const baseParams = (
	overrides: Partial<UpdateCatalogParams>,
): UpdateCatalogParams =>
	({
		skip_deletions: false,
		remove_features: [],
		skip_feature_ids: [],
		...overrides,
	}) as unknown as UpdateCatalogParams;

test("B1 a feature stated in features[] is touched", () => {
	const touched = paramsToTouchedFeatures({
		ctx: ctxWith([feature({ id: "seats", internalId: "fe_1" })]),
		params: baseParams({
			features: [
				{ feature_id: "seats", name: "Seats", type: "boolean" },
			] as never,
		}),
	});
	expect(touched.map((f) => f.id)).toEqual(["seats"]);
});

test("B2 a feature named in remove_features is touched", () => {
	const touched = paramsToTouchedFeatures({
		ctx: ctxWith([feature({ id: "seats", internalId: "fe_1" })]),
		params: baseParams({
			remove_features: [{ feature_id: "seats" }] as never,
		}),
	});
	expect(touched.map((f) => f.id)).toEqual(["seats"]);
});

test("B3 a feature dropped by omission under full state is touched", () => {
	const touched = paramsToTouchedFeatures({
		ctx: ctxWith([
			feature({ id: "kept", internalId: "fe_1" }),
			feature({ id: "forgotten", internalId: "fe_2" }),
		]),
		params: baseParams({
			features: [
				{ feature_id: "kept", name: "Kept", type: "boolean" },
			] as never,
		}),
	});
	expect(touched.map((f) => f.id).sort()).toEqual(["forgotten", "kept"]);
});

test("B4 a feature is untouched when the payload has no opinion on features", () => {
	const touched = paramsToTouchedFeatures({
		ctx: ctxWith([feature({ id: "seats", internalId: "fe_1" })]),
		params: baseParams({ features: undefined }),
	});
	expect(touched).toEqual([]);
});
