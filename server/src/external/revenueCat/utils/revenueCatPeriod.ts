import {
	type FullCusProduct,
	type InsertCustomerProduct,
	ProcessorType,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { updateCachedCustomerProductV2 } from "@/internal/customers/cache/fullSubject/actions/updateCachedCustomerProduct";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos";

export type RevenueCatPeriodEvent = {
	purchased_at_ms?: number | null;
	expiration_at_ms?: number | null;
};

/**
 * Merges the event's store period into the RevenueCat customer product's `processor` (DB, then cache from the DB result).
 * Only moves the period forward, so redelivered older events are ignored. Returns the applied updates, or {} if skipped.
 */
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
	if (!processor) return {};

	const updates = { processor };
	await updateCachedCustomerProductV2({
		ctx,
		customerId,
		customerProductId: customerProduct.id,
		updates,
	});

	return updates;
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
