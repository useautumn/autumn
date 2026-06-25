import type {
	FullCusProduct,
	FullCustomer,
	FullCustomerEntitlement,
	FullSubject,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getOrSetCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";

const SOURCE = "dashboard_live_balances";

const collectEntitlements = (
	source: FullCustomer | FullSubject,
): FullCustomerEntitlement[] => [
	...source.customer_products.flatMap(
		(customerProduct: FullCusProduct) =>
			customerProduct.customer_entitlements ?? [],
	),
	...(source.extra_customer_entitlements ?? []),
];

/**
 * Replaces DB-derived balances on a FullCustomer's entitlements with the live
 * values from the Redis FullSubject cache (what the public API reads). The DB
 * read lags because the balance sync is async, so the dashboard would otherwise
 * show stale numbers. Mutates and returns the same FullCustomer.
 *
 * Goes through getOrSetCachedFullSubject (the same primitive the public API
 * uses) so missing balance fields are filled from the DB before reading — a bare
 * hash read fails open whenever any entitlement isn't cached yet. Fails open: on
 * any error the DB values are kept, so this never makes the dashboard worse.
 */
export const overlayLiveBalances = async ({
	ctx,
	fullCus,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
}): Promise<FullCustomer> => {
	let fullSubject: FullSubject;
	try {
		fullSubject = await getOrSetCachedFullSubject({
			ctx,
			customerId: fullCus.internal_id,
			source: SOURCE,
		});
	} catch (error) {
		ctx.logger.warn(`[${SOURCE}] live balance read failed: ${error}`);
		return fullCus;
	}

	const liveById = new Map(
		collectEntitlements(fullSubject).map((ce) => [ce.id, ce] as const),
	);

	for (const customerEntitlement of collectEntitlements(fullCus)) {
		const live = liveById.get(customerEntitlement.id);
		if (!live) continue;
		customerEntitlement.balance = live.balance;
		customerEntitlement.adjustment = live.adjustment;
		customerEntitlement.additional_balance = live.additional_balance;
		customerEntitlement.entities = live.entities;
	}

	return fullCus;
};
