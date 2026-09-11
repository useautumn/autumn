import { expect, test } from "bun:test";
import {
	type CollectionSpec,
	emitFixture,
} from "../src/emit/runtime/emitFixture";

const PLAN_SPEC: CollectionSpec = {
	builder: "plan",
	idField: "planId",
	responseIdField: "id",
	keys: ["planId", "items"],
	required: ["planId", "items.featureId"],
	paths: [
		"planId",
		"items",
		"items.featureId",
		"items.included",
		"items.unlimited",
	],
	defaults: { "items.unlimited": false },
	pull: true,
};

test("boolean items omit grant values while metered items keep meaningful values", () => {
	const text = emitFixture({
		spec: PLAN_SPEC,
		row: {
			id: "pro",
			items: [
				{ featureId: "enabled", included: 0, unlimited: true },
				{ featureId: "requests", included: 0, unlimited: false },
				{ featureId: "storage", unlimited: true },
			],
		},
		includeMappings: false,
		indent: "",
		context: {
			featureTypes: {
				enabled: "boolean",
				requests: "metered",
				storage: "metered",
			},
		},
	});

	expect(text).toBe(`plan({
	planId: "pro",
	items: [
		{
			featureId: "enabled",
		},
		{
			featureId: "requests",
			included: 0,
		},
		{
			featureId: "storage",
			unlimited: true,
		},
	],
})`);
});
