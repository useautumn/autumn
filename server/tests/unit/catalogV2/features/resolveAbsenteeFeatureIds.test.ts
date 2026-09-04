/**
 * Addressing a feature by internal_id. Pure functions, so the subtle line —
 * a renamed row is still spoken for under the id it is leaving — is proven
 * without a shared org.
 *
 * Contract:
 *   A1  a rename by internal_id does not propose deleting the old id
 *   A2  a row nobody mentions is still proposed
 *   A3  an unknown internal_id is refused, naming the id
 */

import { expect, test } from "bun:test";
import type { Feature, UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { resolveAbsenteeFeatureIds } from "@/internal/catalogV2/actions/updateCatalog/compute/computeRemoveFeaturesPlan/resolveAbsenteeFeatureIds";
import { resolveCurrentFeature } from "@/internal/catalogV2/actions/updateCatalog/utils/featureUpdateUtils/resolveCurrentFeature";

const feature = ({ id, internalId }: { id: string; internalId: string }) =>
	({ id, internal_id: internalId, archived: false }) as unknown as Feature;

const ctxWith = (features: Feature[]) =>
	({ features }) as unknown as AutumnContext;

const fullState = (
	features: UpdateCatalogParams["features"],
): UpdateCatalogParams =>
	({
		skip_deletions: false,
		features,
		remove_features: [],
		skip_feature_ids: [],
	}) as unknown as UpdateCatalogParams;

test("A1 a rename by internal_id keeps the old id spoken for", () => {
	const absent = resolveAbsenteeFeatureIds({
		ctx: ctxWith([feature({ id: "old", internalId: "fe_1" })]),
		params: fullState([
			{ feature_id: "new", internal_id: "fe_1", name: "New", type: "boolean" },
		] as never),
	});
	expect(absent).toEqual([]);
});

test("A2 a row nobody mentions is proposed for removal", () => {
	const absent = resolveAbsenteeFeatureIds({
		ctx: ctxWith([
			feature({ id: "kept", internalId: "fe_1" }),
			feature({ id: "forgotten", internalId: "fe_2" }),
		]),
		params: fullState([
			{
				feature_id: "kept",
				internal_id: "fe_1",
				name: "Kept",
				type: "boolean",
			},
		] as never),
	});
	expect(absent).toEqual(["forgotten"]);
});

test("A3 an unknown internal_id falls back to feature_id", () => {
	expect(
		resolveCurrentFeature({
			features: [feature({ id: "seats", internalId: "fe_1" })],
			entry: { feature_id: "seats", internal_id: "fe_nope" },
		})?.id,
	).toBe("seats");
	expect(
		resolveCurrentFeature({
			features: [feature({ id: "seats", internalId: "fe_1" })],
			entry: { feature_id: "brand_new", internal_id: "fe_nope" },
		}),
	).toBeNull();
	expect(
		resolveCurrentFeature({
			features: [feature({ id: "seats", internalId: "fe_1" })],
			entry: { feature_id: "renamed", internal_id: "fe_1" },
		})?.id,
	).toBe("seats");
});
