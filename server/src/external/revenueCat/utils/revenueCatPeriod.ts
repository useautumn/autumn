import {
	type FullCusProduct,
	type InsertCustomerProduct,
	ProcessorType,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos";

export type RevenueCatPeriodEvent = {
	purchased_at_ms?: number | null;
	expiration_at_ms?: number | null;
};

/**
 * Merges the event's store period into `processor`, only moving it forward. Returns the applied updates, or {} if skipped.
 * DB only: the RevenueCat webhook refresh middleware invalidates the cached customer afterwards.
 */
export const storeRevenueCatPeriod = async ({
	ctx,
	customerProduct,
	event,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	event: RevenueCatPeriodEvent;
}): Promise<Partial<InsertCustomerProduct>> => {
	if (!event.purchased_at_ms || !event.expiration_at_ms) return {};

	const processor = await customerProductRepo.mergeProcessor({
		db: ctx.db,
		cusProductId: customerProduct.id,
		processor: {
			type: ProcessorType.RevenueCat,
			current_period_start: event.purchased_at_ms,
			current_period_end: event.expiration_at_ms,
		},
		periodEndAtLeast: event.expiration_at_ms,
	});
	return processor ? { processor } : {};
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
