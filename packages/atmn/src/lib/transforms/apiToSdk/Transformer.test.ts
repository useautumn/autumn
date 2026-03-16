import { describe, expect, test } from "bun:test";
import { transformApiFeature } from "./feature.js";
import { transformApiPlan } from "./plan.js";
import { createTransformer } from "./Transformer.js";

describe("Transformer", () => {
	describe("Feature transforms", () => {
		test("boolean feature", () => {
			const apiFeature = {
				id: "enabled",
				name: "Feature Enabled",
				type: "boolean",
				event_names: [],
			};

			const result = transformApiFeature(apiFeature);

			expect(result.type).toBe("boolean");
			expect(result.id).toBe("enabled");
			expect(result.name).toBe("Feature Enabled");
		});

		test("single_use → metered with consumable=true", () => {
			const apiFeature = {
				id: "api_calls",
				name: "API Calls",
				type: "single_use",
				event_names: ["api.call"],
			};

			const result = transformApiFeature(apiFeature);

			expect(result.type).toBe("metered");
			expect(result.consumable).toBe(true);
			expect(result.id).toBe("api_calls");
		});

		test("continuous_use → metered with consumable=false", () => {
			const apiFeature = {
				id: "seats",
				name: "Seats",
				type: "continuous_use",
				event_names: [],
			};

			const result = transformApiFeature(apiFeature);

			expect(result.type).toBe("metered");
			expect(result.consumable).toBe(false);
		});

		test("credit_system", () => {
			const apiFeature = {
				id: "credits",
				name: "Credits",
				type: "credit_system",
				credit_schema: [{ metered_feature_id: "api_calls", credit_cost: 10 }],
			};

			const result = transformApiFeature(apiFeature);

			expect(result.type).toBe("credit_system");
			expect(result.consumable).toBe(true);
			expect(result.creditSchema).toHaveLength(1);
		});
	});

	describe("Plan transforms", () => {
		test("basic plan with native auto_enable field", () => {
			const apiPlan: any = {
				id: "pro",
				name: "Pro Plan",
				description: "Professional tier",
				auto_enable: true,
				items: [],
			};

			const result = transformApiPlan(apiPlan);

			expect(result.autoEnable).toBe(true);
			expect(result.id).toBe("pro");
		});

		test("plan with price", () => {
			const apiPlan: any = {
				id: "premium",
				name: "Premium",
				price: {
					amount: 9900,
					interval: "month" as const,
				},
				items: [],
			};

			const result = transformApiPlan(apiPlan);

			expect(result.price).toEqual({
				amount: 9900,
				interval: "month",
			});
		});
	});

	describe("Transformer core", () => {
		test("copy fields", () => {
			const transformer = createTransformer({
				copy: ["id", "name"],
			});

			const result = transformer.transform({
				id: "test",
				name: "Test",
				extra: "ignored",
			});

			expect(result).toEqual({ id: "test", name: "Test" });
		});

		test("rename fields", () => {
			const transformer = createTransformer({
				rename: { old_name: "new_name" },
			});

			const result = transformer.transform({ old_name: "value" });

			expect(result).toEqual({ new_name: "value" });
		});

		test("flatten nested fields", () => {
			const transformer = createTransformer({
				flatten: {
					"parent.child": "flat",
					"deeply.nested.value": "value",
				},
			});

			const result = transformer.transform({
				parent: { child: "test" },
				deeply: { nested: { value: 42 } },
			});

			expect(result).toEqual({
				flat: "test",
				value: 42,
			});
		});

		test("compute fields", () => {
			const transformer = createTransformer({
				compute: {
					doubled: (api: any) => api.value * 2,
					inverted: (api: any) => !api.flag,
				},
			});

			const result = transformer.transform({ value: 5, flag: true });

			expect(result).toEqual({
				doubled: 10,
				inverted: false,
			});
		});

		test("discriminated union", () => {
			const transformer = createTransformer({
				discriminator: "type",
				cases: {
					A: { copy: ["id"], compute: { value: () => "A" } },
					B: { copy: ["id"], compute: { value: () => "B" } },
				},
			});

			const resultA = transformer.transform({ id: "1", type: "A" });
			const resultB = transformer.transform({ id: "2", type: "B" });

			expect(resultA).toEqual({ id: "1", value: "A" });
			expect(resultB).toEqual({ id: "2", value: "B" });
		});

		test("defaults", () => {
			const transformer = createTransformer({
				copy: ["name"],
				defaults: { count: 0, enabled: true },
			});

			const result = transformer.transform({ name: "test" });

			expect(result).toEqual({
				name: "test",
				count: 0,
				enabled: true,
			});
		});
	});
});
