import { expect, test } from "bun:test";
import {
	type ApiFeatureV1,
	dbToApiFeatureV1,
	diffFeatureV1,
	type Feature,
	FeatureType,
	FeatureUsageType,
	featureV1ToDbFeature,
} from "@autumn/shared";
import type { SharedContext } from "@autumn/shared/types/sharedContext";

const feature = (overrides: Partial<ApiFeatureV1>): ApiFeatureV1 => ({
	id: "messages",
	name: "Messages",
	type: FeatureType.Metered,
	consumable: true,
	archived: false,
	...overrides,
});

test("diffFeatureV1 treats empty display shapes as unchanged", () => {
	const diff = diffFeatureV1({
		from: feature({ display: undefined }),
		to: feature({ display: { singular: null, plural: undefined } }),
	});

	expect(diff.previous_attributes).toBeNull();
});

test("diffFeatureV1 sorts order-insensitive feature fields", () => {
	const diff = diffFeatureV1({
		from: feature({ event_names: ["second", "first"] }),
		to: feature({ event_names: ["first", "second"] }),
	});

	expect(diff.previous_attributes).toBeNull();
});

test("diffFeatureV1 returns previous attributes for semantic changes", () => {
	const diff = diffFeatureV1({
		from: feature({ name: "Messages" }),
		to: feature({ name: "Message Credits" }),
	});

	expect(diff.previous_attributes).toEqual({ name: "Messages" });
});

test("a boolean row with a stale usage_type does not phantom-diff on consumable", () => {
	// A feature that was metered before becoming boolean keeps its old config.
	const current = {
		id: "webhooks",
		internal_id: "fe_1",
		name: "Webhooks",
		type: FeatureType.Boolean,
		config: { usage_type: FeatureUsageType.Single },
		archived: false,
	} as Feature;
	const ctx = {} as SharedContext;
	const next = featureV1ToDbFeature({
		apiFeature: {
			id: "webhooks",
			name: "Webhooks",
			type: FeatureType.Boolean,
			consumable: true,
		},
		originalFeature: current,
	});

	const diff = diffFeatureV1({
		from: dbToApiFeatureV1({ ctx, dbFeature: current }),
		to: dbToApiFeatureV1({ ctx, dbFeature: next }),
	});

	expect(diff.previous_attributes).toBeNull();
});
