import { expect } from "bun:test";
import {
	type FullProduct,
	type Price,
	ProcessorType,
	billingControlsFromColumns,
} from "@autumn/shared";

const stripeResourceFields = new Set([
	"stripe_product_id",
	"stripe_price_id",
	"stripe_empty_price_id",
	"stripe_placeholder_price_id",
	"stripe_prepaid_price_v2_id",
	"stripe_meter_id",
	"stripe_event_name",
]);

const logValue = ({
	label,
	value,
	log,
}: {
	label: string;
	value: unknown;
	log?: boolean;
}) => {
	if (log) {
		console.log(label, JSON.stringify(value, null, 2));
	}
};

export const stripeConfigValue = (price: Price | undefined, field: string) =>
	(price?.config as Record<string, string | undefined> | undefined)?.[field];

export const priceMatchKey = (price: Price) => {
	const config = Object.entries(price.config ?? {})
		.filter(([key]) => !stripeResourceFields.has(key))
		.sort(([a], [b]) => a.localeCompare(b));

	return JSON.stringify({
		entitlement_id: price.entitlement_id ? "feature-price" : "base-price",
		config,
	});
};

export const indexPricesByMatchKey = (product: FullProduct) =>
	new Map(product.prices.map((price) => [priceMatchKey(price), price]));

const normalizedFreeTrial = (product: FullProduct) =>
	product.free_trial
		? {
				length: product.free_trial.length,
				duration: product.free_trial.duration,
				unique_fingerprint: product.free_trial.unique_fingerprint,
				card_required: product.free_trial.card_required,
				on_end: product.free_trial.on_end,
			}
		: null;

export const expectVariantProductCorrect = ({
	base,
	variant,
	version = 1,
	isDefault = false,
	expectSharedProcessor = false,
	expectCopiedPlanDetails = false,
	log = false,
}: {
	base: FullProduct;
	variant: FullProduct;
	version?: number;
	isDefault?: boolean;
	expectSharedProcessor?: boolean;
	expectCopiedPlanDetails?: boolean;
	log?: boolean;
}) => {
	logValue({ label: "base product", value: base, log });
	logValue({ label: "variant product", value: variant, log });

	expect(variant.version).toBe(version);
	expect(variant.is_default).toBe(isDefault);
	expect(variant.base_internal_product_id).toBe(base.internal_id);

	if (expectCopiedPlanDetails) {
		expect(variant.description).toBe(base.description);
		expect(variant.is_add_on).toBe(base.is_add_on);
		expect(variant.group).toBe(base.group);
		expect(variant.config).toEqual(base.config);
		expect(variant.metadata).toEqual(base.metadata);
		expect(billingControlsFromColumns(variant)).toEqual(
			billingControlsFromColumns(base),
		);
		expect(normalizedFreeTrial(variant)).toEqual(normalizedFreeTrial(base));
	}

	if (expectSharedProcessor) {
		expect(base.processor?.type).toBe(ProcessorType.Stripe);
		expect(base.processor?.id).toBeTruthy();
		expect(variant.processor?.type).toBe(ProcessorType.Stripe);
		expect(variant.processor?.id).toBe(base.processor?.id);
	}
};

export const expectProductEntitlementCorrect = ({
	product,
	featureId,
	allowance,
	present = true,
	log = false,
}: {
	product: FullProduct;
	featureId: string;
	allowance?: number | null;
	present?: boolean;
	log?: boolean;
}) => {
	logValue({ label: "product entitlements", value: product.entitlements, log });

	const entitlement = product.entitlements.find(
		(candidate) => candidate.feature_id === featureId,
	);

	if (!present) {
		expect(entitlement).toBeUndefined();
		return;
	}

	expect(entitlement).toBeDefined();
	if (allowance !== undefined) {
		expect(entitlement?.allowance).toBe(allowance);
	}
};

export const expectEntitlementAllowanceMatches = ({
	base,
	variant,
	featureId,
	log = false,
}: {
	base: FullProduct;
	variant: FullProduct;
	featureId: string;
	log?: boolean;
}) => {
	const baseEntitlement = base.entitlements.find(
		(entitlement) => entitlement.feature_id === featureId,
	);

	expect(baseEntitlement).toBeDefined();
	expectProductEntitlementCorrect({
		product: variant,
		featureId,
		allowance: baseEntitlement?.allowance,
		log,
	});
};

export const expectStripeResourcesCarriedToVariant = ({
	base,
	variant,
	requireProduct = true,
	requireMeter = false,
	log = false,
}: {
	base: FullProduct;
	variant: FullProduct;
	requireProduct?: boolean;
	requireMeter?: boolean;
	log?: boolean;
}) => {
	expectVariantProductCorrect({
		base,
		variant,
		expectSharedProcessor: true,
		log,
	});

	const variantPricesByKey = indexPricesByMatchKey(variant);
	let productIdAssertions = 0;
	let meterIdAssertions = 0;

	for (const basePrice of base.prices) {
		const variantPrice = variantPricesByKey.get(priceMatchKey(basePrice));
		expect(
			variantPrice,
			`Missing matching variant price for base price ${basePrice.id}`,
		).toBeDefined();

		const baseStripeProductId = stripeConfigValue(
			basePrice,
			"stripe_product_id",
		);
		if (baseStripeProductId) {
			expect(stripeConfigValue(variantPrice, "stripe_product_id")).toBe(
				baseStripeProductId,
			);
			productIdAssertions++;
		}

		const baseStripeMeterId = stripeConfigValue(basePrice, "stripe_meter_id");
		if (baseStripeMeterId) {
			expect(stripeConfigValue(variantPrice, "stripe_meter_id")).toBe(
				baseStripeMeterId,
			);
			meterIdAssertions++;
		}
	}

	if (requireProduct) {
		expect(productIdAssertions).toBeGreaterThan(0);
	}
	if (requireMeter) {
		expect(meterIdAssertions).toBeGreaterThan(0);
	}
};
