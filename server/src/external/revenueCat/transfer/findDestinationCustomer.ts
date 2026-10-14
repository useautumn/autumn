import { CustomerNotFoundError, type FullCustomer } from "@autumn/shared";
import { resolveRevenueCatCustomer } from "@/external/revenueCat/misc/resolveRevenuecatResources";
import type { RevenueCatWebhookContext } from "@/external/revenueCat/webhookMiddlewares/revenuecatWebhookContext";

export const findDestinationCustomer = async ({
	ctx,
	appUserIds,
	overrideCustomerId,
}: {
	ctx: RevenueCatWebhookContext;
	appUserIds: string[];
	overrideCustomerId?: string;
}): Promise<FullCustomer> => {
	const [firstId] = appUserIds;
	if (overrideCustomerId)
		return resolveRevenueCatCustomer({
			ctx,
			appUserId: firstId,
			overrideCustomerId,
			autoCreateCustomer: true,
		});

	for (const appUserId of appUserIds) {
		try {
			return await resolveRevenueCatCustomer({
				ctx,
				appUserId,
				autoCreateCustomer: false,
			});
		} catch (error) {
			if (!(error instanceof CustomerNotFoundError)) throw error;
		}
	}

	return resolveRevenueCatCustomer({
		ctx,
		appUserId: firstId,
		autoCreateCustomer: true,
	});
};
