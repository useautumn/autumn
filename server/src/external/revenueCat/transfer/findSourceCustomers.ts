import { CustomerNotFoundError, type FullCustomer } from "@autumn/shared";
import { resolveRevenueCatCustomer } from "@/external/revenueCat/misc/resolveRevenuecatResources";
import type { RevenueCatWebhookContext } from "@/external/revenueCat/webhookMiddlewares/revenuecatWebhookContext";

/** Autumn customers behind the RC users purchases were taken from; ids Autumn never saw (e.g. anonymous) drop out. */
export const findSourceCustomers = async ({
	ctx,
	appUserIds,
}: {
	ctx: RevenueCatWebhookContext;
	appUserIds: string[];
}): Promise<FullCustomer[]> => {
	const found = new Map<string, FullCustomer>();
	for (const appUserId of appUserIds) {
		try {
			const customer = await resolveRevenueCatCustomer({
				ctx,
				appUserId,
				autoCreateCustomer: false,
			});
			found.set(customer.internal_id, customer);
		} catch (error) {
			if (!(error instanceof CustomerNotFoundError)) throw error;
		}
	}
	return [...found.values()];
};
