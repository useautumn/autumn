/**
 * Dimensions live inside each rate-card row, not on the card as a whole.
 *
 * Red (current):  the row never renders a Dimensions control or the tables.
 * Green (after):  an expanded row offers a per-row Dimensions switch (admin),
 *                 shows its own tables when the row has rules, and a collapsed
 *                 or non-admin row shows neither.
 */

import { expect, test } from "bun:test";
import {
	type CreditSchemaItem,
	type Feature,
	FeatureType,
	FeatureUsageType,
} from "@autumn/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { CreditRateCardRow } from "../src/views/products/features/credit-systems/components/CreditRateCardRow";

const feature = {
	id: "feature_a",
	name: "Feature A",
	type: FeatureType.Metered,
	config: { usage_type: FeatureUsageType.Single },
} as Feature;

const plainRow: CreditSchemaItem = {
	metered_feature_id: feature.id,
	feature_amount: 1,
	credit_amount: 1,
};

const dimensionedRow: CreditSchemaItem = {
	...plainRow,
	dimensions: {
		size_large: { match: { size: "large" }, credit_amount: 16 },
	},
};

const renderRow = ({
	item,
	isExpanded,
	showRateCardControls,
}: {
	item: CreditSchemaItem;
	isExpanded: boolean;
	showRateCardControls: boolean;
}) =>
	renderToStaticMarkup(
		<CreditRateCardRow
			item={item}
			availableFeatures={[feature]}
			allFeatures={[feature]}
			onChange={() => {}}
			onRemove={() => {}}
			isExpanded={isExpanded}
			onToggle={() => {}}
			showRateCardControls={showRateCardControls}
		/>,
	);

test("an expanded row with dimensions shows its own dimension tables", () => {
	const html = renderRow({
		item: dimensionedRow,
		isExpanded: true,
		showRateCardControls: true,
	});

	expect(html).toContain('aria-label="Dimensions"');
	expect(html).toContain('aria-label="size values"');
	expect(html).toContain('aria-label="size_large credit cost"');
});

test("an expanded plain row offers the switch but no tables", () => {
	const html = renderRow({
		item: plainRow,
		isExpanded: true,
		showRateCardControls: true,
	});

	expect(html).toContain('aria-label="Dimensions"');
	expect(html).not.toContain('aria-label="size values"');
	expect(html).not.toContain("New rate");
});

test("non-admins see no dimensions control", () => {
	const html = renderRow({
		item: dimensionedRow,
		isExpanded: true,
		showRateCardControls: false,
	});

	expect(html).not.toContain('aria-label="Dimensions"');
	expect(html).not.toContain('aria-label="size values"');
});

test("a collapsed row shows nothing about dimensions", () => {
	const html = renderRow({
		item: dimensionedRow,
		isExpanded: false,
		showRateCardControls: true,
	});

	expect(html).not.toContain('aria-label="Dimensions"');
	expect(html).not.toContain('aria-label="size values"');
});
