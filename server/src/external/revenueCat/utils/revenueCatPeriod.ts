import {
	type FullCusProduct,
	type InsertCustomerProduct,
	ProcessorType,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerProductActions } from "@/internal/customers/cusProducts/actions";

export type RevenueCatPeriodEvent = {
	purchased_at_ms?: number | null;
	expiration_at_ms?: number | null;
};

/** Builds a `processor` update that stamps the event's store period, keeping existing processor keys. */
export const revenueCatEventToPeriodUpdates = ({
	customerProduct,
	event,
}: {
	customerProduct: FullCusProduct;
	event: RevenueCatPeriodEvent;
}): Partial<InsertCustomerProduct> => {
	if (!event.purchased_at_ms || !event.expiration_at_ms) return {};

	return {
		processor: {
			...customerProduct.processor,
			type: ProcessorType.RevenueCat,
			current_period_start: event.purchased_at_ms,
			current_period_end: event.expiration_at_ms,
		},
	};
};

/** Persists the event's store period on the RevenueCat customer product (DB + cache). */
export const storeRevenueCatPeriod = async ({
	ctx,
	customerProduct,
	customerId,
	event,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	customerId: string;
	event: RevenueCatPeriodEvent;
}): Promise<void> => {
	const updates = revenueCatEventToPeriodUpdates({ customerProduct, event });
	if (Object.keys(updates).length === 0) return;

	await customerProductActions.updateDbAndCache({
		ctx,
		customerId,
		cusProductId: customerProduct.id,
		updates,
	});
};

/** The store period stored on a RevenueCat customer product, in ms; null when it's not a RevenueCat plan or has none yet. */
export const customerProductToRevenueCatPeriod = ({
	customerProduct,
}: {
	customerProduct: FullCusProduct;
}): { current_period_start: number; current_period_end: number } | null => {
	const processor = customerProduct.processor;
	if (processor?.type !== ProcessorType.RevenueCat) return null;
	if (!processor.current_period_start || !processor.current_period_end) {
		return null;
	}

	return {
		current_period_start: processor.current_period_start,
		current_period_end: processor.current_period_end,
	};
};
