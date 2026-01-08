import { type FullCusProduct, formatMs } from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import type { BillingContext } from "@server/internal/billing/v2/billingContext";
import type Stripe from "stripe";
import { billingContextFormatPriceByStripePriceId } from "@/internal/billing/v2/utils/billingContextPriceLookup";

const LOG_PREFIX = "[buildStripePhasesUpdate]";

/**
 * Formats a customer product as a compact string.
 */
const formatCustomerProduct = (customerProduct: FullCusProduct): string => {
	const entity = customerProduct.entity_id
		? `@${customerProduct.entity_id}`
		: "";
	const period = `${formatMs(customerProduct.starts_at)} → ${formatMs(customerProduct.ended_at)}`;
	return `${customerProduct.product.name}${entity} [${customerProduct.status}] (${period})`;
};

/**
 * Formats a single phase item for logging.
 */
const formatPhaseItem = ({
	item,
	billingContext,
}: {
	item: Stripe.SubscriptionScheduleUpdateParams.Phase.Item;
	billingContext: BillingContext;
}): string => {
	const stripePriceId =
		typeof item.price === "string"
			? item.price
			: (item.price as unknown as Stripe.Price)?.id;

	const priceDisplay = stripePriceId
		? billingContextFormatPriceByStripePriceId({
				stripePriceId,
				billingContext,
			})
		: "unknown";

	const qty = item.quantity === undefined ? "undefined" : item.quantity;
	return `${priceDisplay} (qty: ${qty})`;
};

/**
 * Logs a single phase compactly.
 */
export const logPhase = ({
	ctx,
	billingContext,
	phaseIndex,
	phase,
	activeCustomerProducts,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	phaseIndex: number;
	phase: Stripe.SubscriptionScheduleUpdateParams.Phase;
	activeCustomerProducts: FullCusProduct[];
}): void => {
	const start = formatMs((phase.start_date as number) * 1000);
	const end = phase.end_date
		? formatMs((phase.end_date as number) * 1000)
		: "∞";
	const products = activeCustomerProducts
		.map((cp) => {
			const entity = cp.entity_id ? `@${cp.entity_id}` : "";
			return `${cp.product.name}${entity}`;
		})
		.join(", ");

	ctx.logger.debug(
		`${LOG_PREFIX}   Phase ${phaseIndex + 1}: ${start} → ${end}`,
	);
	ctx.logger.debug(`${LOG_PREFIX}     Products: [${products}]`);
	ctx.logger.debug(`${LOG_PREFIX}     Items:`);
	for (const item of phase.items ?? []) {
		ctx.logger.debug(
			`${LOG_PREFIX}       - ${formatPhaseItem({ item, billingContext })}`,
		);
	}
};

/**
 * Logs the transition point inputs compactly.
 */
export const logTransitionPoints = ({
	ctx,
	customerProducts,
	transitionPoints,
	nowMs,
}: {
	ctx: AutumnContext;
	customerProducts: FullCusProduct[];
	transitionPoints: (number | undefined)[];
	nowMs: number;
}): void => {
	ctx.logger.debug(`${LOG_PREFIX} ──── INPUTS ────`);
	ctx.logger.debug(`${LOG_PREFIX} Now: ${formatMs(nowMs)}`);
	ctx.logger.debug(
		`${LOG_PREFIX} Customer Products (${customerProducts.length}):`,
	);
	for (const cp of customerProducts) {
		ctx.logger.debug(`${LOG_PREFIX}   - ${formatCustomerProduct(cp)}`);
	}

	ctx.logger.debug(`${LOG_PREFIX} ──── TRANSITIONS ────`);
	const transitions = transitionPoints
		.map((tp) => (tp ? formatMs(tp) : "∞"))
		.join(" → ");
	ctx.logger.debug(`${LOG_PREFIX} ${transitions}`);

	ctx.logger.debug(`${LOG_PREFIX} ──── PHASES ────`);
};
