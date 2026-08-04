import type { AppEnv } from "@autumn/shared";
import { CusProductStatus } from "@autumn/shared";
import { pollUntil } from "@tests/utils/genUtils";
import type { DrizzleCli } from "@/db/initDrizzle";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

/**
 * Waits until the customer products linked to a Stripe subscription are expired.
 * Use before asserting a product is gone — polling for absence passes instantly.
 */
export const waitForCustomerProductExpired = async ({
	db,
	orgId,
	env,
	stripeSubscriptionId,
	timeoutMs = 30_000,
	intervalMs = 500,
}: {
	db: DrizzleCli;
	orgId: string;
	env: AppEnv;
	stripeSubscriptionId: string;
	timeoutMs?: number;
	intervalMs?: number;
}) =>
	pollUntil({
		fetch: () =>
			CusProductService.getByStripeSubId({
				db,
				stripeSubId: stripeSubscriptionId,
				orgId,
				env,
			}),
		until: (customerProducts) =>
			customerProducts.length > 0 &&
			customerProducts.every(
				(customerProduct) =>
					customerProduct.status === CusProductStatus.Expired,
			),
		timeoutMs,
		intervalMs,
	});
