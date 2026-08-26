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
	expect(html).not.toContain(">Tiered<");
	expect(html).toContain('aria-label="Credit cost"');
});

test("admins can edit billing units and graduated tiers without a stale warning", () => {
	const html = renderRateCardRow({
		item: {
			metered_feature_id: feature.id,
			feature_amount: 100,
			tier_behavior: "graduated",
			tiers: [{ to: "inf", credit_amount: 1 }],
		},
		showRateCardControls: true,
	});

	expect(html).toContain('aria-label="Billing units"');
	expect(html).toContain(">Tiered<");
	expect(html).not.toContain("Tiered rating is not live yet");
});
