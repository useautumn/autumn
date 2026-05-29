import { notNullish } from "@autumn/shared";
import type Stripe from "stripe";
import { CusService } from "@/internal/customers/CusService.js";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import type { StripeWebhookContext } from "../webhookMiddlewares/stripeWebhookContext.js";

const SYNCED_FIELDS = ["name", "email"] as const;

/**
 * Syncs a Stripe customer's name + email to the linked Autumn customer on
 * `customer.updated`. Each field is synced independently; an unchanged or
 * cleared (empty/null) field is left as-is so a partial update never clobbers
 * Autumn's stored value.
 */
export async function handleStripeCustomerUpdated({
	ctx,
	event,
}: {
	ctx: StripeWebhookContext;
	event: Stripe.CustomerUpdatedEvent;
}) {
	const { logger, fullCustomer } = ctx;
	if (!fullCustomer) return;

	const stripeCustomer = event.data.object;
	const update: { name?: string; email?: string } = {};

	for (const field of SYNCED_FIELDS) {
		const newValue = stripeCustomer[field];
		if (!notNullish(newValue) || newValue === "") continue;
		if (fullCustomer[field] === newValue) continue;
		update[field] = newValue;
	}

	if (!update.name && !update.email) return;

	const idOrInternalId = fullCustomer.id || fullCustomer.internal_id;

	await CusService.update({
		ctx,
		idOrInternalId,
		update,
	});

	await deleteCachedFullCustomer({
		ctx,
		customerId: idOrInternalId,
		source: "customer.updated: detail sync",
	});

	logger.info(
		`[customer.updated] synced ${Object.keys(update).join(", ")} for customer ${fullCustomer.id}`,
	);
}
