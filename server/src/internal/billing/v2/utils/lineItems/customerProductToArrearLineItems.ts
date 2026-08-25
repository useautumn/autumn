import type { BillingContext, UpdateCustomerEntitlement } from "@autumn/shared";
import {
	billingContextToCurrency,
	cusPriceToCusEntWithCusProduct,
	customerProductToEntity,
	EntInterval,
	type FullCusEntWithFullCusProduct,
	type FullCusProduct,
	fullCustomerToSkipOverageBilling,
	getCycleEnd,
	invoiceCreditCustomerEntitlementToLineItems,
	isAllocatedV2CustomerEntitlement,
	isConsumablePrice,
	isV4Usage,
	type LineItem,
	type LineItemContext,
	usagePriceToLineItem,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { getResetBalancesUpdate } from "@/internal/customers/cusProducts/cusEnts/groupByUtils";
import { isInvoiceCreditFeature } from "@/internal/features/creditSystemUtils.js";
import { getLineItemBillingPeriod } from "./getLineItemBillingPeriod";

export const customerProductToArrearLineItems = ({
	ctx,
	customerProduct,
	billingContext,
	filters = {},
	options = {
		includePeriodDescription: false,
		updateNextResetAt: true,
		discountable: false,
	},
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	billingContext: BillingContext;
	filters?: {
		onlyV4Usage?: boolean;
		/** Optional filter to skip specific entitlements (e.g., for multi-interval billing) */
		cusEntFilter?: (cusEnt: FullCusEntWithFullCusProduct) => boolean;
		invoiceCreditCusEntFilter?: (
			cusEnt: FullCusEntWithFullCusProduct,
		) => boolean;
	};
	options?: {
		includePeriodDescription?: boolean;
		updateNextResetAt?: boolean;
		discountable?: boolean;
		includeZeroAmounts?: boolean;
		invoiceCredits?: {
			idempotencyScope?: string;
			fullyOffsetOverage?: boolean;
			includeLineItems?: boolean;
		};
	};
}): {
	lineItems: LineItem[];
	invoiceCreditLineItems: LineItem[];
	updateCustomerEntitlements: UpdateCustomerEntitlement[];
} => {
	const lineItems: LineItem[] = [];
	const invoiceCreditLineItems: LineItem[] = [];
	const updateCustomerEntitlements: UpdateCustomerEntitlement[] = [];
	const entity = customerProductToEntity({
		customerProduct,
		entities: billingContext.fullCustomer.entities,
	});

	for (const customerPrice of customerProduct.customer_prices) {
		const price = customerPrice.price;
		if (!isConsumablePrice(price)) continue;
		if (
			filters.onlyV4Usage &&
			!isV4Usage({ price, cusProduct: customerProduct })
		) {
			continue;
		}

		const customerEntitlement = cusPriceToCusEntWithCusProduct({
			cusProduct: customerProduct,
			cusPrice: customerPrice,
			cusEnts: customerProduct.customer_entitlements,
		});
		if (!customerEntitlement) {
			throw new Error(
				`[customerProductToArrearLineItems] No cusEnt found for cusPrice: ${customerPrice.id}`,
			);
		}

		const isInvoiceCredit = isInvoiceCreditFeature({
			feature: customerEntitlement.entitlement.feature,
		});
		const invoiceCreditOptions = options.invoiceCredits;
		if (isInvoiceCredit) {
			const invoiceCreditFilter =
				filters.invoiceCreditCusEntFilter ?? filters.cusEntFilter;
			if (invoiceCreditFilter && !invoiceCreditFilter(customerEntitlement)) {
				continue;
			}
		} else if (
			filters.cusEntFilter &&
			!filters.cusEntFilter(customerEntitlement)
		) {
			continue;
		}

		const billingPeriod = getLineItemBillingPeriod({ billingContext, price });
		const context: LineItemContext = {
			price,
			product: customerProduct.product,
			feature: customerEntitlement.entitlement.feature,
			billingPeriod,
			direction: "charge",
			billingTiming: "in_arrear",
			now: billingContext.currentEpochMs,
			currency: billingContextToCurrency({ org: ctx.org, billingContext }),
			discountable: isInvoiceCredit ? false : options.discountable,
			entity,
			customerProduct,
			customerPrice,
			customerEntitlement: isInvoiceCredit ? customerEntitlement : undefined,
		};

		if (isInvoiceCredit) {
			if (
				invoiceCreditOptions &&
				invoiceCreditOptions.includeLineItems !== false
			) {
				const invoiceCreditFeature = customerEntitlement.entitlement.feature;
				const skipInvoiceCreditOverage = fullCustomerToSkipOverageBilling({
					fullCustomer: billingContext.fullCustomer,
					featureId: invoiceCreditFeature.id,
					internalEntityId: entity?.internal_id,
				});
				invoiceCreditLineItems.push(
					...invoiceCreditCustomerEntitlementToLineItems({
						customerEntitlement,
						context,
						features: ctx.features,
						idempotencyScope: invoiceCreditOptions.idempotencyScope,
						fullyOffsetOverage:
							invoiceCreditOptions.fullyOffsetOverage ||
							skipInvoiceCreditOverage,
					}),
				);
			}
		} else {
			const lineItem = usagePriceToLineItem({
				cusEnt: customerEntitlement,
				context,
				options: {
					includePeriodDescription: options.includePeriodDescription,
					discountable: options.discountable,
				},
			});
			if (options.includeZeroAmounts || lineItem.amount !== 0) {
				lineItems.push(lineItem);
			}
		}

		if (isAllocatedV2CustomerEntitlement(customerEntitlement)) continue;

		const resetBalancesUpdate = getResetBalancesUpdate({
			cusEnt: customerEntitlement,
			allowance: customerEntitlement.entitlement.allowance ?? 0,
		});
		const nextResetAt = getCycleEnd({
			anchor: billingContext.billingCycleAnchorMs,
			interval: customerEntitlement.entitlement.interval ?? EntInterval.Month,
			intervalCount: customerEntitlement.entitlement.interval_count,
			now: billingPeriod?.end ?? billingContext.currentEpochMs,
		});
		updateCustomerEntitlements.push({
			customerEntitlement,
			updates: {
				...resetBalancesUpdate,
				next_reset_at:
					options.updateNextResetAt === false ? undefined : nextResetAt,
			},
		});
	}

	return {
		lineItems,
		invoiceCreditLineItems,
		updateCustomerEntitlements,
	};
};
