import type {
	BillingContext,
	FullCusEntWithFullCusProduct,
	FullCusProduct,
	LineItem,
	LineItemContext,
	UpdateCustomerEntitlement,
} from "@autumn/shared";
import {
	billingContextToCurrency,
	buildLineItem,
	cusEntToInvoiceOverage,
	cusProductToPrices,
	customerProductToEntity,
	EntInterval,
	findFeatureByInternalId,
	fullCustomerToSkipOverageBilling,
	getCycleEnd,
} from "@autumn/shared";
import { customerProductToBasePrice } from "@shared/utils/cusProductUtils/convertCusProduct/customerProductToPrice.js";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getResetBalancesUpdate } from "@/internal/customers/cusProducts/cusEnts/groupByUtils.js";
import { isInvoiceCreditFeature } from "@/internal/features/creditSystemUtils.js";
import { getLineItemBillingPeriod } from "./getLineItemBillingPeriod.js";

const withStableId = ({
	lineItem,
	idempotencyScope,
	position,
}: {
	lineItem: LineItem;
	idempotencyScope?: string;
	position: string;
}) =>
	idempotencyScope
		? {
				...lineItem,
				amountAfterDiscountsFinalized: true,
				id: `invoice_li_credit_${idempotencyScope}_${position}`,
			}
		: { ...lineItem, amountAfterDiscountsFinalized: true };

export const customerProductToInvoiceCreditLineItems = ({
	ctx,
	customerProduct,
	billingContext,
	filters = {},
	idempotencyScope,
	fullyOffsetOverage = false,
	includeLineItems = true,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	billingContext: BillingContext;
	filters?: {
		customerEntitlementFilter?: (
			customerEntitlement: FullCusEntWithFullCusProduct,
		) => boolean;
	};
	idempotencyScope?: string;
	fullyOffsetOverage?: boolean;
	includeLineItems?: boolean;
}): {
	lineItems: LineItem[];
	updateCustomerEntitlements: UpdateCustomerEntitlement[];
} => {
	const lineItems: LineItem[] = [];
	const updateCustomerEntitlements: UpdateCustomerEntitlement[] = [];
	const price =
		customerProductToBasePrice({ customerProduct }) ??
		cusProductToPrices({ cusProduct: customerProduct })[0];
	const entity = customerProductToEntity({
		customerProduct,
		entities: billingContext.fullCustomer.entities,
	});

	for (const storedCustomerEntitlement of customerProduct.customer_entitlements) {
		const customerEntitlement: FullCusEntWithFullCusProduct = {
			...storedCustomerEntitlement,
			customer_product: customerProduct,
		};
		const invoiceCreditFeature = customerEntitlement.entitlement.feature;
		if (!isInvoiceCreditFeature({ feature: invoiceCreditFeature })) continue;
		if (
			filters.customerEntitlementFilter &&
			!filters.customerEntitlementFilter(customerEntitlement)
		) {
			continue;
		}

		const resetBalancesUpdate = getResetBalancesUpdate({
			cusEnt: customerEntitlement,
			allowance: customerEntitlement.entitlement.allowance ?? 0,
		});
		const nextResetAt = getCycleEnd({
			anchor:
				billingContext.resetCycleAnchorMs ??
				billingContext.billingCycleAnchorMs,
			interval: customerEntitlement.entitlement.interval ?? EntInterval.Month,
			intervalCount: customerEntitlement.entitlement.interval_count,
			now: customerEntitlement.next_reset_at ?? billingContext.currentEpochMs,
		});
		updateCustomerEntitlements.push({
			customerEntitlement,
			updates: { ...resetBalancesUpdate, next_reset_at: nextResetAt },
		});

		const attribution = Object.entries(
			customerEntitlement.usage_attribution ?? {},
		)
			.filter(([, value]) => value.credits > 0)
			.sort(([firstInternalId], [secondInternalId]) =>
				firstInternalId.localeCompare(secondInternalId),
			);
		if (!includeLineItems || attribution.length === 0) continue;
		if (!price) continue;

		const billingPeriod = getLineItemBillingPeriod({ billingContext, price });
		const baseContext = {
			price,
			product: customerProduct.product,
			billingPeriod,
			billingTiming: "in_arrear",
			now: billingContext.currentEpochMs,
			currency: billingContextToCurrency({ org: ctx.org, billingContext }),
			discountable: false,
			entity,
			customerProduct,
			customerEntitlement,
		} satisfies Omit<LineItemContext, "direction" | "feature">;

		let totalCredits = new Decimal(0);
		for (const [sourceInternalFeatureId, sourceAttribution] of attribution) {
			const sourceFeature = findFeatureByInternalId({
				features: ctx.features,
				internalId: sourceInternalFeatureId,
				errorOnNotFound: true,
			});
			totalCredits = totalCredits.add(sourceAttribution.credits);
			const sourceLineItem = buildLineItem({
				context: {
					...baseContext,
					feature: sourceFeature,
					direction: "charge",
				},
				amount: sourceAttribution.credits,
				description: sourceFeature.name,
				shouldProrate: false,
				usage: sourceAttribution.units,
			});
			lineItems.push(
				withStableId({
					lineItem: sourceLineItem,
					idempotencyScope,
					position: `${customerEntitlement.id}_${sourceInternalFeatureId}`,
				}),
			);
		}

		const overage = cusEntToInvoiceOverage({ cusEnt: customerEntitlement });
		const skipInvoiceCreditOverage = fullCustomerToSkipOverageBilling({
			fullCustomer: billingContext.fullCustomer,
			featureId: invoiceCreditFeature.id,
			internalEntityId: entity?.internal_id,
		});
		const creditsApplied =
			fullyOffsetOverage || skipInvoiceCreditOverage
				? totalCredits
				: Decimal.max(totalCredits.sub(overage), 0);
		if (creditsApplied.isZero()) continue;

		const offsetLineItem = buildLineItem({
			context: {
				...baseContext,
				feature: invoiceCreditFeature,
				direction: "refund",
			},
			amount: creditsApplied.toNumber(),
			description: "Credits applied",
			shouldProrate: false,
		});
		lineItems.push(
			withStableId({
				lineItem: offsetLineItem,
				idempotencyScope,
				position: `${customerEntitlement.id}_applied`,
			}),
		);
	}

	return { lineItems, updateCustomerEntitlements };
};
