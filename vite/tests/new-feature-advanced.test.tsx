/**
 * The feature sheets' Advanced section no longer offers a Stripe product;
 * feature-level Stripe products are managed through the CLI mappings.
 *
 * Red (current):  the section renders a "Stripe Product (optional)" select.
 * Green (after):  only event names remain, so non-metered features get no section.
 */

import { expect, test } from "bun:test";
import {
	type CreateFeature,
	FeatureType,
	FeatureUsageType,
} from "@autumn/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { NewFeatureAdvanced } from "../src/views/products/plan/components/new-feature/NewFeatureAdvanced";

const render = (feature: CreateFeature) =>
	renderToStaticMarkup(
		<NewFeatureAdvanced feature={feature} setFeature={() => {}} />,
	);

test("metered features keep event names and lose the Stripe product select", () => {
	const html = render({
		id: "messages",
		name: "Messages",
		type: FeatureType.Metered,
		config: { usage_type: FeatureUsageType.Single },
		event_names: [],
	} as CreateFeature);

	expect(html).toContain("Advanced");
	expect(html).not.toContain("Stripe Product");
});

test("credit systems have no advanced section at all", () => {
	const html = render({
		id: "credits",
		name: "Credits",
		type: FeatureType.CreditSystem,
		config: { usage_type: FeatureUsageType.Single, schema: [] },
		event_names: [],
	} as CreateFeature);

	expect(html).toBe("");
});
