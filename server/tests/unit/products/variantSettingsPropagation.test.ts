import { describe, expect, test } from "bun:test";
import type { ApiPlanV1 } from "@autumn/shared";
import {
	applyDiffToVariantPlan,
	getVariantSettingsPatch,
	omitVariantOwnedSettings,
	variantSettingsPatchHasValues,
} from "@/internal/product/actions/common/planTransformUtils";

const plan = (overrides: Partial<ApiPlanV1>): ApiPlanV1 =>
	({
		id: "pro",
		name: "Pro",
		description: null,
		group: null,
		add_on: false,
		items: [],
		price: null,
		free_trial: null,
		...overrides,
	}) as unknown as ApiPlanV1;

describe("variant settings propagation on base rename", () => {
	test("getVariantSettingsPatch includes name for same-plan version propagation", () => {
		const patch = getVariantSettingsPatch({
			from: plan({ name: "Pro" }),
			to: plan({ name: "Pro Plus" }),
		});

		expect(patch).toEqual({ name: "Pro Plus" });
	});

	test("omitVariantOwnedSettings strips name but keeps other settings", () => {
		const stripped = omitVariantOwnedSettings({
			name: "Pro Plus",
			description: "New description",
		});

		expect(stripped).toEqual({ description: "New description" });
	});

	test("base rename only produces an empty variant patch", () => {
		const stripped = omitVariantOwnedSettings(
			getVariantSettingsPatch({
				from: plan({ name: "Pro" }),
				to: plan({ name: "Pro Plus" }),
			}),
		);

		expect(variantSettingsPatchHasValues(stripped)).toBe(false);
	});

	test("variant keeps its own name when base settings propagate", () => {
		const settingsPatch = omitVariantOwnedSettings(
			getVariantSettingsPatch({
				from: plan({ name: "Pro", description: null }),
				to: plan({ name: "Pro Plus", description: "Updated" }),
			}),
		);
		const variantPlan = plan({ id: "pro_annual", name: "Pro Annual" });

		const previewPlan = applyDiffToVariantPlan({
			plan: variantPlan,
			diff: {},
			settingsPatch,
		});

		expect(previewPlan.name).toBe("Pro Annual");
		expect(previewPlan.description).toBe("Updated");
	});
});
