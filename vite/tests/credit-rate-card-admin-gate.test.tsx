import { expect, test } from "bun:test";
import {
	type CreditSchemaItem,
	type Feature,
	FeatureType,
	FeatureUsageType,
} from "@autumn/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { CreditDimensionsSection } from "../src/views/products/features/credit-systems/components/CreditDimensionsSection";
import { CreditRateCardRow } from "../src/views/products/features/credit-systems/components/CreditRateCardRow";

const feature = {
	id: "feature_a",
	name: "Feature A",
	type: FeatureType.Metered,
	config: { usage_type: FeatureUsageType.Single },
} as Feature;

const renderRateCardRow = ({
	item,
	showRateCardControls,
}: {
	item: CreditSchemaItem;
	showRateCardControls: boolean;
}) =>
	renderToStaticMarkup(
		<CreditRateCardRow
			item={item}
			availableFeatures={[feature]}
			allFeatures={[feature]}
			onChange={() => {}}
			onRemove={() => {}}
			isExpanded={true}
			onToggle={() => {}}
			showRateCardControls={showRateCardControls}
		/>,
	);

test("non-admins retain flat credit costs without rate-card controls", () => {
	const html = renderRateCardRow({
		item: {
			metered_feature_id: feature.id,
			feature_amount: 100,
			credit_amount: 1,
		},
		showRateCardControls: false,
	});

	expect(html).not.toContain('aria-label="Billing units"');
	expect(html).not.toContain("Add Tier");
	expect(html).toContain('aria-label="Credit cost"');
});

test("admins can edit billing units and add graduated tiers", () => {
	const html = renderRateCardRow({
		item: {
			metered_feature_id: feature.id,
			feature_amount: 100,
			tier_behavior: "graduated",
			tiers: [
				{ to: 10_000, credit_amount: 1 },
				{ to: "inf", credit_amount: 0.5 },
			],
		},
		showRateCardControls: true,
	});

	expect(html).toContain('aria-label="Billing units"');
	expect(html).toContain("Add Tier");
	expect(html).toContain('aria-label="Tier 1 upper boundary"');
});

test("collapsed rows summarize the rate without exposing controls", () => {
	const html = renderToStaticMarkup(
		<CreditRateCardRow
			item={{
				metered_feature_id: feature.id,
				feature_amount: 100,
				credit_amount: 1,
			}}
			availableFeatures={[feature]}
			allFeatures={[feature]}
			onChange={() => {}}
			onRemove={() => {}}
			isExpanded={false}
			onToggle={() => {}}
			showRateCardControls={true}
		/>,
	);

	expect(html).toContain("1 credit per 100");
	expect(html).not.toContain('aria-label="Credit cost"');
});

test("the dimensions section renders a price list with the row rate as the fallback", () => {
	const html = renderToStaticMarkup(
		<CreditDimensionsSection
			schema={[
				{
					metered_feature_id: feature.id,
					credit_amount: 1,
					dimensions: {
						size_large: { match: { size: "large" }, credit_amount: 16 },
					},
					multipliers: {
						lifecycle_spot: { match: { lifecycle: "spot" }, factor: 0.3 },
					},
				},
			]}
			allFeatures={[feature]}
			onItemChange={() => {}}
		/>,
	);

	expect(html).toContain('aria-label="Dimension property"');
	expect(html).toContain('value="size"');
	expect(html).toContain('aria-label="size large credit cost"');
	expect(html).toContain("anything else");
	expect(html).toContain('aria-label="lifecycle spot factor"');
	expect(html).not.toContain(">Feature A<");
});

test("API-authored rules are shown read-only instead of being rewritten", () => {
	const html = renderToStaticMarkup(
		<CreditDimensionsSection
			schema={[
				{
					metered_feature_id: feature.id,
					credit_amount: 1,
					dimensions: {
						large_eu: {
							match: { size: "large", region: "eu" },
							credit_amount: 20,
						},
					},
				},
			]}
			allFeatures={[feature]}
			onItemChange={() => {}}
		/>,
	);

	expect(html).toContain("configured through the API");
	expect(html).not.toContain('aria-label="Dimension property"');
});

test("values are pills and each pill is a priced row", () => {
	const html = renderToStaticMarkup(
		<CreditDimensionsSection
			schema={[
				{
					metered_feature_id: feature.id,
					credit_amount: 1,
					dimensions: {
						size_small: { match: { size: "small" }, credit_amount: 1 },
						size_large: { match: { size: "large" }, credit_amount: 16 },
					},
				},
			]}
			allFeatures={[feature]}
			onItemChange={() => {}}
		/>,
	);

	expect(html).toContain('aria-label="Dimension values"');
	expect(html).toContain('aria-label="size small credit cost"');
	expect(html).toContain('aria-label="size large credit cost"');
	expect(html).not.toContain(">Add value<");
});
