import {
	CusProductStatus,
	cusProductToProduct,
	type FullCusProduct,
	formatSeconds,
	type Price,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AutumnContext } from "@/honoUtils/HonoEnv";

/** Price with associated product name for logging. */
type PriceWithProduct = {
	price: Price;
	productName: string;
};

/** Generic phase item type that works for both response and update params. */
type PhaseItem = {
	price?: string | Stripe.Price | Stripe.DeletedPrice;
	quantity?: number;
};

/** Generic phase type that works for both response and update params. */
type LoggablePhase = {
	start_date?: number | "now";
	end_date?: number | "now" | null;
	items: PhaseItem[];
};

/**
 * Extracts prices with product names from customer products.
 */
const customerProductsToPricesWithProduct = ({
	customerProducts,
}: {
	customerProducts: FullCusProduct[];
}): PriceWithProduct[] => {
	return customerProducts.flatMap((customerProduct) =>
		customerProduct.customer_prices.map((customerPrice) => ({
			price: customerPrice.price,
			productName: customerProduct.product.name,
		})),
	);
};

/**
 * Matches a Stripe price ID to an Autumn price with product info.
 */
const matchStripePriceIdToAutumnPrice = ({
	stripePriceId,
	pricesWithProduct,
}: {
	stripePriceId: string;
	pricesWithProduct: PriceWithProduct[];
}): PriceWithProduct | null => {
	for (const priceWithProduct of pricesWithProduct) {
		const { price } = priceWithProduct;
		if (
			price.config?.stripe_price_id === stripePriceId ||
			price.config?.stripe_empty_price_id === stripePriceId
		) {
			return priceWithProduct;
		}
	}
	return null;
};

/**
 * Formats a phase item for logging by matching Stripe price ID to Autumn price.
 */
const formatPhaseItemWithAutumnPrice = ({
	item,
	pricesWithProduct,
}: {
	item: PhaseItem;
	pricesWithProduct: PriceWithProduct[];
}): string => {
	if (!item.price) {
		return "unknown price";
	}

	const stripePriceId =
		typeof item.price === "string" ? item.price : item.price?.id;

	if (!stripePriceId) {
		return "unknown price";
	}

	const autumnPriceInfo = matchStripePriceIdToAutumnPrice({
		stripePriceId,
		pricesWithProduct,
	});

	const quantityDisplay =
		item.quantity === undefined ? "metered" : item.quantity;

	if (autumnPriceInfo) {
		return `${autumnPriceInfo.productName} - ${autumnPriceInfo.price.id} (qty: ${quantityDisplay})`;
	}

	return `${stripePriceId} (qty: ${quantityDisplay})`;
};

/**
 * Formats customer product status for logging.
 */
const formatCustomerProductStatus = (
	customerProduct: FullCusProduct,
): string => {
	const status = customerProduct.status;
	const statusLabels: Record<CusProductStatus, string> = {
		[CusProductStatus.Active]: "✓ active",
		[CusProductStatus.Scheduled]: "⏳ scheduled",
		[CusProductStatus.Expired]: "✗ expired",
		[CusProductStatus.PastDue]: "⚠ past_due",
		[CusProductStatus.Trialing]: "🔄 trialing",
		[CusProductStatus.Unknown]: "? unknown",
	};
	return statusLabels[status] ?? status;
};

/**
 * Logs a single Stripe subscription schedule phase.
 *
 * Works with both Stripe.SubscriptionSchedule.Phase (response) and
 * Stripe.SubscriptionScheduleUpdateParams.Phase (update params).
 *
 * Converts customer products to prices and logs:
 * - Phase timing (start -> end)
 * - Each item matched with its Autumn price
 * - Optionally: customer products with their statuses
 */
export const logPhase = ({
	ctx,
	phase,
	customerProducts,
	phaseIndex,
	logPrefix = "[logPhase]",
	showCustomerProducts = false,
}: {
	ctx: AutumnContext;
	phase: LoggablePhase;
	customerProducts: FullCusProduct[];
	phaseIndex?: number;
	logPrefix?: string;
	showCustomerProducts?: boolean;
}): void => {
	// 1. Convert customer products to prices with product names for matching
	const pricesWithProduct = customerProductsToPricesWithProduct({
		customerProducts,
	});

	// 2. Format phase timing
	const formatStartDate = (): string => {
		if (phase.start_date === undefined) return "undefined";
		if (phase.start_date === "now") return "now";
		return formatSeconds(phase.start_date);
	};
	const formatEndDate = (): string => {
		if (phase.end_date === undefined || phase.end_date === null)
			return "indefinite";
		if (phase.end_date === "now") return "now";
		return formatSeconds(phase.end_date);
	};
	const startDate = formatStartDate();
	const endDate = formatEndDate();
	const phaseLabel =
		phaseIndex !== undefined ? `Phase ${phaseIndex + 1}` : "Phase";

	ctx.logger.debug(`${logPrefix} ${phaseLabel}: ${startDate} -> ${endDate}`);

	// 3. Log each item with Autumn price matching
	for (const item of phase.items) {
		const formattedItem = formatPhaseItemWithAutumnPrice({
			item,
			pricesWithProduct,
		});
		ctx.logger.debug(`${logPrefix}   - ${formattedItem}`);
	}

	// 4. Optionally log customer products with their statuses
	if (showCustomerProducts) {
		ctx.logger.debug(`${logPrefix}   Customer Products:`);
		for (const customerProduct of customerProducts) {
			const product = cusProductToProduct({ cusProduct: customerProduct });
			const entity = customerProduct.entity_id
				? `@${customerProduct.entity_id}`
				: "";
			const status = formatCustomerProductStatus(customerProduct);
			ctx.logger.debug(
				`${logPrefix}     - ${product.name}${entity}: ${status}`,
			);
		}
	}
};

/**
 * Logs multiple Stripe subscription schedule phases.
 *
 * Works with both Stripe.SubscriptionSchedule.Phase[] (response) and
 * Stripe.SubscriptionScheduleUpdateParams.Phase[] (update params).
 *
 * Iterates through phases and logs each one with timing and items.
 * Optionally shows customer products with their statuses.
 */
export const logPhases = ({
	ctx,
	phases,
	customerProducts,
	logPrefix = "[logPhases]",
	showCustomerProducts = false,
}: {
	ctx: AutumnContext;
	phases: LoggablePhase[];
	customerProducts: FullCusProduct[];
	logPrefix?: string;
	showCustomerProducts?: boolean;
}): void => {
	ctx.logger.debug(`${logPrefix} Phases (${phases.length}):`);

	for (let index = 0; index < phases.length; index++) {
		const phase = phases[index];
		logPhase({
			ctx,
			phase,
			customerProducts,
			phaseIndex: index,
			logPrefix,
			showCustomerProducts,
		});
	}
};
