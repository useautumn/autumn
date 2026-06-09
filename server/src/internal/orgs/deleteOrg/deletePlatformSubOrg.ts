import {
	AppEnv,
	customerEntitlements,
	customerPrices,
	customerProducts,
	customers,
	ErrCode,
	member,
	organizations,
	type Organization,
	products,
	RecaseError,
} from "@autumn/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { DrizzleCli } from "@server/db/initDrizzle.js";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import {
	deleteStripeAccounts,
	deleteStripeWebhooks,
	deleteSvixWebhooks,
} from "@/internal/orgs/orgUtils/deleteOrgUtils.js";

/**
 * Deletes a platform-created sub-org and all its dependencies.
 * Used by `DELETE /platform/organizations` and `clearMasterOrg.ts`.
 *
 * `skipLiveCustomerCheck` bypasses the `OrgHasCustomers` guard (test cleanup).
 */
export const deletePlatformSubOrg = async ({
	db,
	org,
	logger,
	skipLiveCustomerCheck = false,
}: {
	db: DrizzleCli;
	org: Organization;
	logger: Logger;
	skipLiveCustomerCheck?: boolean;
}): Promise<void> => {
	if (!skipLiveCustomerCheck) {
		const hasCustomers = await db.query.customers.findFirst({
			where: and(eq(customers.org_id, org.id), eq(customers.env, AppEnv.Live)),
		});

		if (hasCustomers) {
			throw new RecaseError({
				message: "Cannot delete org with production mode customers",
				code: ErrCode.OrgHasCustomers,
				statusCode: 400,
			});
		}
	}

	logger.info("1. Deleting svix webhooks");
	await deleteSvixWebhooks({ org, logger });

	logger.info("2. Deleting stripe webhooks");
	await deleteStripeWebhooks({ org, logger });

	logger.info("3. Deleting stripe accounts");
	await deleteStripeAccounts({ org, logger });

	logger.info("4. Deleting sandbox customers");
	await db
		.delete(customers)
		.where(
			and(eq(customers.org_id, org.id), eq(customers.env, AppEnv.Sandbox)),
		);

	logger.info("5. Deleting org memberships");
	await db.delete(member).where(eq(member.organizationId, org.id));

	// products.org_id cascades on org delete, but customer_products RESTRICTs
	// the product delete — so tear down the customer-side rows first, deepest
	// FK child to shallowest: cusEnts/cusPrices → customer_products → products.
	logger.info("6. Deleting customer products and products");
	const orgProductIds = (
		await db
			.select({ internalId: products.internal_id })
			.from(products)
			.where(eq(products.org_id, org.id))
	).map((p) => p.internalId);

	if (orgProductIds.length > 0) {
		const cusProductIds = (
			await db
				.select({ id: customerProducts.id })
				.from(customerProducts)
				.where(inArray(customerProducts.internal_product_id, orgProductIds))
		).map((cp) => cp.id);

		if (cusProductIds.length > 0) {
			await db
				.delete(customerEntitlements)
				.where(inArray(customerEntitlements.customer_product_id, cusProductIds));
			await db
				.delete(customerPrices)
				.where(inArray(customerPrices.customer_product_id, cusProductIds));
			await db
				.delete(customerProducts)
				.where(inArray(customerProducts.id, cusProductIds));
		}

		await db.delete(products).where(eq(products.org_id, org.id));
	}

	logger.info("7. Deleting organization");
	await db.delete(organizations).where(eq(organizations.id, org.id));
};
