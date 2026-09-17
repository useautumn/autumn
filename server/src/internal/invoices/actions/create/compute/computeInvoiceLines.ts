import {
	BillingMethod,
	buildLineItem,
	ErrCode,
	type Feature,
	type FullProduct,
	type InvoiceFeatureQuantity,
	type LineItem,
	type LineItemContext,
	type Price,
	RecaseError,
	usagePriceToLineDescription,
} from "@autumn/shared";
import { fixedPriceToDescription } from "@shared/utils/billingUtils/invoicingUtils/descriptionUtils/fixedPriceToLineDescription";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customLineItemsToLineItems } from "@/internal/billing/v2/utils/lineItems/customLineItemsToLineItems";
import { isInvoiceCreditFeature } from "@/internal/features/creditSystemUtils";
import type {
	CreateInvoiceContext,
	InvoicePlanContext,
} from "../setup/setupCreateInvoiceContext";
import { featureQuantityToAmount } from "./featureQuantityToAmount";
import { findInvoiceFeaturePrice } from "./findInvoiceFeaturePrice";
import { licenseQuantityToAmount } from "./licenseQuantityToAmount";
import { namedStripePriceLineAmount } from "./namedStripePriceLineAmount";
import { prorateInvoiceLineAmount } from "./prorateInvoiceLineAmount";
import { resolveInvoiceBasePrice } from "./resolveInvoiceBasePrice";
import { usageEntriesToCredits } from "./usageEntriesToCredits";

/** A billing line plus which request entry produced it. */
export type InvoiceLine = {
	lineItem: LineItem;
	planKey: string | null;
	planId: string | null;
	featureId: string | null;
	quantity: number | null;
	/** Set only when the request named a Stripe price to bill this line under. */
	stripePriceId?: string;
	stripeQuantity?: number;
};

const lineContext = ({
	invoiceContext,
	price,
	product,
	feature,
	nowMs,
}: {
	invoiceContext: CreateInvoiceContext;
	price: Price;
	product: FullProduct;
	feature?: Feature;
	nowMs: number;
}): LineItemContext => ({
	price,
	product,
	feature,
	currency: invoiceContext.currency,
	effectivePeriod: invoiceContext.period,
	direction: "charge",
	now: nowMs,
	billingTiming: "in_advance",
	// Autumn assigns coupons explicitly, so Stripe must not auto-discount lines.
	discountable: false,
});

const toLine = ({
	context,
	amount,
	description,
	quantity,
	prorated,
	planKey,
	planId,
	featureId,
	stripePriceId,
	stripeQuantity,
}: {
	context: LineItemContext;
	amount: number;
	description: string;
	quantity: number | null;
	prorated: boolean;
	planKey: string | null;
	planId: string | null;
	featureId: string | null;
	stripePriceId?: string;
	stripeQuantity?: number;
}): InvoiceLine => {
	const lineItem = buildLineItem({
		context,
		amount,
		description,
		stripePriceId: context.price.config.stripe_price_id ?? undefined,
		stripeProductId:
			context.price.config.stripe_product_id ??
			context.product.processor?.id ??
			undefined,
		shouldProrate: false,
		usage: quantity ?? undefined,
		overage: quantity ?? undefined,
	});
	return {
		lineItem: { ...lineItem, prorated },
		planKey,
		planId,
		featureId,
		quantity,
		stripePriceId,
		stripeQuantity,
	};
};

const customizedFeaturePrice = ({
	plan,
	featureId,
	catalogPrice,
}: {
	plan: InvoicePlanContext;
	featureId: string;
	catalogPrice: Price;
}): Price => {
	const override = plan.params.customize?.items?.find(
		(item) => item.feature_id === featureId,
	)?.price;
	if (!override) return catalogPrice;

	return {
		...catalogPrice,
		is_custom: true,
		tier_behavior: override.tier_behavior ?? catalogPrice.tier_behavior,
		config: {
			...catalogPrice.config,
			interval: override.interval,
			interval_count: override.interval_count,
			billing_units: override.billing_units ?? 1,
			usage_tiers: override.tiers
				? override.tiers.map((tier) => ({
						to: tier.to,
						amount: tier.amount ?? 0,
						flat_amount: tier.flat_amount,
					}))
				: [{ to: "inf" as const, amount: override.amount ?? 0 }],
			stripe_price_id:
				override.processors?.stripe?.price_id ??
				catalogPrice.config.stripe_price_id,
		} as Price["config"],
	};
};

const customizedCreditSystem = ({
	plan,
	feature,
}: {
	plan: InvoicePlanContext;
	feature: Feature;
}): Feature => {
	const schema = plan.params.customize?.items?.find(
		(item) => item.feature_id === feature.id,
	)?.feature_override?.credit_schema;
	if (!schema) return feature;
	return { ...feature, config: { ...feature.config, schema } };
};

const billableUnitsFor = ({
	plan,
	entry,
	feature,
}: {
	plan: InvoicePlanContext;
	entry: InvoiceFeatureQuantity;
	feature: Feature;
}): { units: number; alreadyMoney: boolean } => {
	if (entry.quantity !== undefined) {
		return { units: entry.quantity, alreadyMoney: false };
	}
	const creditSystem = customizedCreditSystem({ plan, feature });
	const credits = usageEntriesToCredits({
		creditSystem,
		entries: entry.usage ?? [],
	});
	// Invoice-credit systems already express credits as money.
	return {
		units: credits,
		alreadyMoney: isInvoiceCreditFeature({ feature: creditSystem }),
	};
};

const computeFeatureLine = ({
	ctx,
	invoiceContext,
	plan,
	product,
	entry,
	nowMs,
}: {
	ctx: AutumnContext;
	invoiceContext: CreateInvoiceContext;
	plan: InvoicePlanContext;
	product: FullProduct;
	entry: InvoiceFeatureQuantity;
	nowMs: number;
}): InvoiceLine | undefined => {
	const feature = ctx.features.find(
		(candidate) => candidate.id === entry.feature_id,
	);
	if (!feature) {
		throw new RecaseError({
			message: `Feature ${entry.feature_id} not found`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const price = customizedFeaturePrice({
		plan,
		featureId: entry.feature_id,
		catalogPrice: findInvoiceFeaturePrice({
			prices: product.prices,
			featureId: entry.feature_id,
			billingBehavior: entry.billing_behavior,
		}),
	});

	const { units, alreadyMoney } = billableUnitsFor({ plan, entry, feature });
	if (units <= 0) return undefined;

	const namedPriceId = plan.params.customize?.items?.find(
		(item) => item.feature_id === entry.feature_id,
	)?.price?.processors?.stripe?.price_id;
	const named = namedPriceId
		? namedStripePriceLineAmount({
				namedStripePrices: invoiceContext.namedStripePrices,
				stripePriceId: namedPriceId,
				quantity: units,
				billingUnits: price.config.billing_units,
				currency: invoiceContext.currency,
				prorateRequested: entry.prorate,
			})
		: undefined;

	const baseAmount = alreadyMoney
		? units
		: featureQuantityToAmount({
				price,
				quantity: units,
				currency: invoiceContext.currency,
			});

	const prorate =
		!named &&
		(entry.prorate ?? entry.billing_behavior === BillingMethod.Prepaid);
	const amount =
		named?.amount ??
		(prorate
			? prorateInvoiceLineAmount({
					price,
					amount: baseAmount,
					period: invoiceContext.period,
				})
			: baseAmount);

	const context = lineContext({
		invoiceContext,
		price,
		product,
		feature,
		nowMs,
	});
	return toLine({
		context,
		amount,
		description: usagePriceToLineDescription({
			usage: units,
			context,
			includePeriodDescription: false,
		}),
		quantity: units,
		prorated: prorate && Boolean(invoiceContext.period),
		planKey: plan.planKey,
		planId: product.id,
		featureId: feature.id,
		stripePriceId: namedPriceId,
		stripeQuantity: named?.stripeQuantity,
	});
};

const computePlanLines = ({
	ctx,
	invoiceContext,
	plan,
	nowMs,
}: {
	ctx: AutumnContext;
	invoiceContext: CreateInvoiceContext;
	plan: InvoicePlanContext;
	nowMs: number;
}): InvoiceLine[] => {
	const { fullProduct, params } = plan;
	const lines: InvoiceLine[] = [];

	const base = resolveInvoiceBasePrice({
		product: fullProduct,
		customize: params.customize,
	});
	if (base) {
		const namedPriceId = params.customize?.price?.processors?.stripe?.price_id;
		const named = namedPriceId
			? namedStripePriceLineAmount({
					namedStripePrices: invoiceContext.namedStripePrices,
					stripePriceId: namedPriceId,
					quantity: null,
					currency: invoiceContext.currency,
					prorateRequested: params.prorate,
				})
			: undefined;
		const prorate = !named && (params.prorate ?? true);
		const context = lineContext({
			invoiceContext,
			price: base.price,
			product: fullProduct,
			nowMs,
		});
		lines.push(
			toLine({
				context,
				amount:
					named?.amount ??
					(prorate
						? prorateInvoiceLineAmount({
								price: base.price,
								amount: base.amount,
								period: invoiceContext.period,
							})
						: base.amount),
				description: fixedPriceToDescription({ price: base.price, context }),
				quantity: null,
				prorated: prorate && Boolean(invoiceContext.period),
				planKey: plan.planKey,
				planId: fullProduct.id,
				featureId: null,
				stripePriceId: namedPriceId,
				stripeQuantity: named?.stripeQuantity,
			}),
		);
	}

	for (const entry of params.feature_quantities ?? []) {
		const line = computeFeatureLine({
			ctx,
			invoiceContext,
			plan,
			product: fullProduct,
			entry,
			nowMs,
		});
		if (line) lines.push(line);
	}

	for (const license of params.license_quantities ?? []) {
		const resolved = licenseQuantityToAmount({
			parent: fullProduct,
			licensePlanId: license.license_plan_id,
			quantity: license.quantity,
			customize: license.customize,
		});
		const namedLicensePriceId =
			license.customize?.price?.processors?.stripe?.price_id;
		const namedLicense = namedLicensePriceId
			? namedStripePriceLineAmount({
					namedStripePrices: invoiceContext.namedStripePrices,
					stripePriceId: namedLicensePriceId,
					quantity: license.quantity,
					billingUnits: resolved.price.config.billing_units,
					currency: invoiceContext.currency,
					prorateRequested: license.prorate,
				})
			: undefined;
		if (resolved.amount > 0 || namedLicense) {
			const prorate = !namedLicense && (license.prorate ?? true);
			const context = lineContext({
				invoiceContext,
				price: resolved.price,
				product: resolved.licenseProduct,
				nowMs,
			});
			lines.push(
				toLine({
					context,
					amount:
						namedLicense?.amount ??
						(prorate
							? prorateInvoiceLineAmount({
									price: resolved.price,
									amount: resolved.amount,
									period: invoiceContext.period,
								})
							: resolved.amount),
					description: fixedPriceToDescription({
						price: resolved.price,
						context,
						quantity: license.quantity,
					}),
					quantity: license.quantity,
					prorated: prorate && Boolean(invoiceContext.period),
					planKey: plan.planKey,
					planId: resolved.licenseProduct.id,
					featureId: null,
					stripePriceId: license.customize?.price?.processors?.stripe?.price_id,
				}),
			);
		}
		for (const entry of license.feature_quantities ?? []) {
			const line = computeFeatureLine({
				ctx,
				invoiceContext,
				plan,
				product: resolved.licenseProduct,
				entry,
				nowMs,
			});
			if (line) lines.push(line);
		}
	}

	return lines;
};

/** Turns the request into billing lines. Pure: no Stripe, no DB writes. */
export const computeInvoiceLines = ({
	ctx,
	invoiceContext,
	nowMs = Date.now(),
}: {
	ctx: AutumnContext;
	invoiceContext: CreateInvoiceContext;
	nowMs?: number;
}): InvoiceLine[] => {
	const lines = invoiceContext.plans.flatMap((plan) =>
		computePlanLines({ ctx, invoiceContext, plan, nowMs }),
	);

	const customLines = customLineItemsToLineItems({
		customLineItems: invoiceContext.params.custom_line_items ?? [],
		currency: invoiceContext.currency,
	}).map((lineItem) => ({
		lineItem,
		planKey: null,
		planId: null,
		featureId: null,
		quantity: null,
	}));

	const all = [...lines, ...customLines].filter(
		(line) => !new Decimal(line.lineItem.amount).isZero(),
	);
	if (all.length === 0) {
		throw new RecaseError({
			message: "Nothing to invoice: every line resolved to zero",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
	return all;
};
