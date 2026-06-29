import { expect, test } from "bun:test";
import { type ApiFeatureV1, diffFeatureV1, FeatureType } from "@autumn/shared";

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
