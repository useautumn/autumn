/** The apply gate: a base row at `none` still has work when a nested variant,
 * license link or sibling version carries a changing action. */

import { expect, test } from "bun:test";
import { previewIsEmpty } from "../src/render/renderPreview";

test("a nested variant create is work even when the base row is none", () => {
	const preview = {
		features: [],
		plans: [
			{
				planId: "pro",
				action: "none",
				variants: [{ variantPlanId: "pro_annual", variantAction: "create" }],
			},
		],
	};
	// biome-ignore lint/suspicious/noExplicitAny: the preview shape under test
	expect(previewIsEmpty({ preview: preview as any })).toBe(false);
});

test("all-none rows with all-none nesting are empty", () => {
	const preview = {
		features: [{ featureId: "seats", action: "none" }],
		plans: [
			{
				planId: "pro",
				action: "none",
				variants: [{ variantPlanId: "pro_annual", variantAction: "none" }],
				licenses: [{ licensePlanId: "seat", licenseAction: "none" }],
			},
		],
	};
	// biome-ignore lint/suspicious/noExplicitAny: the preview shape under test
	expect(previewIsEmpty({ preview: preview as any })).toBe(true);
});

test("a variant marked explicit (archived or customized) is work", () => {
	const preview = {
		features: [],
		plans: [
			{
				planId: "pro",
				action: "none",
				variants: [{ variantPlanId: "pro_plus", variantAction: "explicit" }],
			},
		],
	};
	// biome-ignore lint/suspicious/noExplicitAny: the preview shape under test
	expect(previewIsEmpty({ preview: preview as any })).toBe(false);
});
