/**
 * Dimensions live inside each rate-card row as an "Add dimension" action
 * beside Add Tier; once a row has rules the tables show with a
 * "Remove dimensions" action, and the collapsed summary counts them.
 *
 * Red (current):  the row renders a Dimensions switch instead.
 * Green (after):  button when empty, tables + remove action when populated,
 *                 nothing for non-admins or collapsed rows.
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
		size_xl: { match: { size: "xl" }, credit_amount: 20 },
	},
	multipliers: {
		lifecycle_spot: { match: { lifecycle: "spot" }, factor: 0.3 },
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

test("an expanded plain row offers Add dimension beside Add Tier and no tables", () => {
	const html = renderRow({
		item: plainRow,
		isExpanded: true,
		showRateCardControls: true,
	});

	expect(html).toContain("Add Tier");
	expect(html).toContain("Add dimension");
	expect(html).not.toContain("Remove dimensions");
	expect(html).not.toContain('aria-label="size values"');
	expect(html).not.toContain('aria-label="Dimensions"');
});

test("an expanded row with rules shows its tables and a remove action instead of the button", () => {
	const html = renderRow({
		item: dimensionedRow,
		isExpanded: true,
		showRateCardControls: true,
	});

	expect(html).toContain('aria-label="size values"');
	expect(html).toContain('aria-label="size_large credit cost"');
	expect(html).toContain("Remove dimensions");
	expect(html).not.toContain("Add dimension");
});

test("non-admins see neither the button nor the tables", () => {
	const html = renderRow({
		item: dimensionedRow,
		isExpanded: true,
		showRateCardControls: false,
	});

	expect(html).not.toContain("Add dimension");
	expect(html).not.toContain("Remove dimensions");
	expect(html).not.toContain('aria-label="size values"');
});

test("a collapsed row counts its dimensions in the summary and shows no controls", () => {
	const html = renderRow({
		item: dimensionedRow,
		isExpanded: false,
		showRateCardControls: true,
	});

	expect(html).toContain("2 dimensions");
	expect(html).not.toContain("Add dimension");
	expect(html).not.toContain('aria-label="size values"');
});
