import {
	CreateCustomerSchema,
	CustomerNotFoundError,
	ErrCode,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	ProcessorType,
	RecaseError,
} from "@shared/index";
import { getCtxWithCustomerRedis } from "@/external/redis/customerRedisRouting.js";
import {
	RCMappingService,
	type RevenuecatFeatureQuantity,
} from "@/external/revenueCat/misc/RCMappingService";
import type { RevenueCatWebhookContext } from "@/external/revenueCat/webhookMiddlewares/revenuecatWebhookContext";
import { CusService } from "@/internal/customers/CusService";
import { computeRolloutSnapshot } from "@/internal/misc/rollouts/rolloutUtils.js";
import { ProductService } from "@/internal/products/ProductService";
import { pricesOnlyOneOff } from "@/internal/products/prices/priceUtils.js";
import { getOrCreateCustomer } from "../../../internal/customers/cusUtils/getOrCreateCustomer";

/**
 * Maintain the customer's RC identity alias set. Every RC id ever seen for this
 * customer is kept: `id` is the primary (set once on first seed, NEVER updated),
 * `aliases` accumulates every other id (append-only, deduped, never removed).
 * On first seed `id = app_user_id`, `aliases = [original_app_user_id?]`.
 * Fire-and-forget: must never block or throw the webhook.
 */
const accumulateRevenueCatAliases = ({
	ctx,
	customer,
	appUserId,
	originalAppUserId,
}: {
	ctx: RevenueCatWebhookContext;
	customer: FullCustomer;
	appUserId: string;
	originalAppUserId?: string;
}) => {
	const resolvedCustomerId = customer.id ?? customer.internal_id;
	const hasOriginal = Boolean(
		originalAppUserId && originalAppUserId !== appUserId,
	);
	const incomingIds = [
		appUserId,
		...(hasOriginal ? [originalAppUserId as string] : []),
	];

	const existing = customer.processors?.revenuecat;

	// First seed: no RC identity yet. Primary id = app_user_id.
	if (!existing?.id) {
		const nextRevenuecat = {
			id: appUserId,
			aliases: hasOriginal ? [originalAppUserId as string] : [],
		};
		void writeRevenueCatIdentity({
			ctx,
			customer,
			nextRevenuecat,
			logExtras: {
				rc_alias_seeded: true,
				seeded_id: appUserId,
				alias_count: nextRevenuecat.aliases.length,
				resolved_customer_id: resolvedCustomerId,
			},
			successMessage: "Seeded RevenueCat identity alias set",
		});
		return;
	}

	// Append: keep id, add any incoming id not already known.
	const knownIds = new Set<string>([existing.id, ...(existing.aliases ?? [])]);
	const toAppend = incomingIds.filter((incoming) => !knownIds.has(incoming));

	if (toAppend.length === 0) return;

	const nextAliases = [...(existing.aliases ?? []), ...toAppend];
	void writeRevenueCatIdentity({
		ctx,
		customer,
		nextRevenuecat: { id: existing.id, aliases: nextAliases },
		logExtras: {
			rc_alias_appended: true,
			appended_ids: toAppend,
			alias_count: nextAliases.length,
			resolved_customer_id: resolvedCustomerId,
		},
		successMessage: "Appended RevenueCat alias(es)",
	});
};

const writeRevenueCatIdentity = async ({
	ctx,
	customer,
	nextRevenuecat,
	logExtras,
	successMessage,
}: {
	ctx: RevenueCatWebhookContext;
	customer: FullCustomer;
	nextRevenuecat: { id: string; aliases: string[] };
	logExtras: Record<string, unknown>;
	successMessage: string;
}) => {
	try {
		await CusService.update({
			ctx,
			idOrInternalId: customer.internal_id,
			update: {
				processors: {
					...(customer.processors ?? {}),
					revenuecat: nextRevenuecat,
				},
			},
		});
		ctx.logger.child({ context: { extras: logExtras } }).info(successMessage);
	} catch (error) {
		ctx.logger
			.child({
				context: {
					extras: {
						...logExtras,
						rc_alias_write_failed: true,
						error: error instanceof Error ? error.message : String(error),
					},
				},
			})
			.error("Failed to write RevenueCat identity alias set");
	}
};

/**
 * Dual-key customer resolution for RevenueCat webhooks. Matches by
 * `processors.revenuecat.id` (against BOTH app_user_id and original_app_user_id)
 * first, then falls back to `customer_id`. Ambiguity (processors key and
 * customer_id resolving to different customers) is rejected, not silently picked.
 */
const resolveRevenueCatCustomer = async ({
	ctx,
	appUserId,
	originalAppUserId,
	autoCreateCustomer,
}: {
	ctx: RevenueCatWebhookContext;
	appUserId: string;
	originalAppUserId?: string;
	autoCreateCustomer: boolean;
}): Promise<FullCustomer> => {
	const hasOriginal = Boolean(
		originalAppUserId && originalAppUserId !== appUserId,
	);

	// Processors-key match, read-both (app_user_id first, then original).
	let processorMatch = await CusService.getByRevenueCatAppUserId({
		ctx,
		appUserId,
		withEntities: true,
		withSubs: true,
	});
	let matchedBy = processorMatch ? "processors_key_app_user_id" : null;

	if (!processorMatch && hasOriginal) {
		processorMatch = await CusService.getByRevenueCatAppUserId({
			ctx,
			appUserId: originalAppUserId as string,
			withEntities: true,
			withSubs: true,
		});
		if (processorMatch) matchedBy = "processors_key_original_app_user_id";
	}

	// Customer_id fallback, read-both. Always run so ambiguity can be detected.
	let customerIdMatch = await CusService.getFull({
		ctx,
		idOrInternalId: appUserId,
		withEntities: true,
		withSubs: true,
		allowNotFound: true,
	});
	let customerIdMatchedBy = customerIdMatch ? "customer_id_app_user_id" : null;

	if (!customerIdMatch && hasOriginal) {
		customerIdMatch = await CusService.getFull({
			ctx,
			idOrInternalId: originalAppUserId as string,
			withEntities: true,
			withSubs: true,
			allowNotFound: true,
		});
		if (customerIdMatch)
			customerIdMatchedBy = "customer_id_original_app_user_id";
	}

	const rcLogExtras = {
		rc_resolution: true,
		app_user_id: appUserId,
		original_app_user_id: originalAppUserId ?? null,
	};

	if (
		processorMatch &&
		customerIdMatch &&
		processorMatch.internal_id !== customerIdMatch.internal_id
	) {
		ctx.logger
			.child({
				context: {
					extras: {
						...rcLogExtras,
						matched_by: "ambiguous",
						processors_key_customer:
							processorMatch.id ?? processorMatch.internal_id,
						customer_id_customer:
							customerIdMatch.id ?? customerIdMatch.internal_id,
					},
				},
			})
			.error(
				"RevenueCat match ambiguous: processors key and customer_id resolve to different customers",
			);
		throw new RecaseError({
			message: `RevenueCat app_user_id ${appUserId} matches different customers by processors key and customer_id`,
			code: ErrCode.MultipleCustomersFound,
			statusCode: 409,
		});
	}

	if (processorMatch) {
		ctx.logger
			.child({
				context: {
					extras: {
						...rcLogExtras,
						matched_by: matchedBy,
						resolved_customer_id:
							processorMatch.id ?? processorMatch.internal_id,
					},
				},
			})
			.info("Resolved RevenueCat customer via processors key");
		accumulateRevenueCatAliases({
			ctx,
			customer: processorMatch,
			appUserId,
			originalAppUserId,
		});
		return processorMatch;
	}

	if (customerIdMatch) {
		ctx.logger
			.child({
				context: {
					extras: {
						...rcLogExtras,
						matched_by: customerIdMatchedBy,
						resolved_customer_id:
							customerIdMatch.id ?? customerIdMatch.internal_id,
					},
				},
			})
			.info("Resolved RevenueCat customer via customer_id fallback");
		accumulateRevenueCatAliases({
			ctx,
			customer: customerIdMatch,
			appUserId,
			originalAppUserId,
		});
		return customerIdMatch;
	}

	if (!autoCreateCustomer) {
		throw new CustomerNotFoundError({ customerId: appUserId });
	}

	// An email app_user_id is an invalid Autumn customer.id: create with a null
	// id + email, keep the email only in the processors key.
	const idIsValid = CreateCustomerSchema.shape.id.safeParse(appUserId).success;
	const createdCustomer = await getOrCreateCustomer({
		ctx,
		customerId: idIsValid ? appUserId : null,
		withEntities: true,
		customerData: {
			email: idIsValid ? undefined : appUserId,
			processors: {
				revenuecat: {
					id: appUserId,
					aliases: hasOriginal ? [originalAppUserId as string] : [],
				},
			},
		},
	});

	ctx.logger
		.child({
			context: {
				extras: {
					...rcLogExtras,
					matched_by: "auto_create",
					email_as_id: !idIsValid,
					resolved_customer_id:
						createdCustomer.id ?? createdCustomer.internal_id,
				},
			},
		})
		.info("Auto-created RevenueCat customer");

	return createdCustomer;
};

/**
 * Resolves a RevenueCat product ID to an Autumn product and fetches the customer.
 * Also sets ctx.customerId for cache invalidation by the refresh middleware.
 * Throws if product mapping, product, customer is not found, or customer has non-RevenueCat products.
 */
export const resolveRevenuecatResources = async ({
	ctx,
	revenuecatProductId,
	customerId,
	originalAppUserId,
	autoCreateCustomer = false,
}: {
	ctx: RevenueCatWebhookContext;
	revenuecatProductId: string;
	customerId: string;
	originalAppUserId?: string;
	autoCreateCustomer?: boolean;
}): Promise<{
	ctx: RevenueCatWebhookContext;
	product: FullProduct;
	customer: FullCustomer;
	cusProducts: FullCusProduct[];
	featureQuantities?: RevenuecatFeatureQuantity[];
}> => {
	const { db, org, env } = ctx;

	// Look up Autumn product ID + prepaid grants from the RevenueCat mapping
	const mapping = await RCMappingService.resolveMapping({
		db,
		orgId: org.id,
		env,
		revenuecatProductId,
	});

	const autumnProductId = mapping?.autumnProductId ?? null;
	const featureQuantities = mapping?.featureQuantities;

	if (!autumnProductId) {
		throw new RecaseError({
			message: `No Autumn product mapped to RevenueCat product: ${revenuecatProductId}`,
			code: ErrCode.ProductNotFound,
			statusCode: 404,
		});
	}

	const [product, customer] = await Promise.all([
		ProductService.getFull({
			db,
			orgId: org.id,
			env,
			idOrInternalId: autumnProductId,
		}),
		resolveRevenueCatCustomer({
			ctx,
			appUserId: customerId,
			originalAppUserId,
			autoCreateCustomer,
		}),
	]);

	// If the customer has a product from a different processor than RevenueCat and it has no subscriptions, throw an error.
	//
	// Exception: true one-off purchases (no recurring intervals) are safe to mix
	// across processors because they create a parallel cus_product without
	// replacing the customer's existing subscription. This lets a Stripe-subscribed
	// customer buy a one-off pack via RevenueCat (and vice versa).
	const incomingIsOneOff = pricesOnlyOneOff(product.prices);

	if (
		!incomingIsOneOff &&
		customer.customer_products.some(
			(cp) =>
				cp.processor?.type !== ProcessorType.RevenueCat &&
				(cp.subscription_ids?.length ?? 0) !== 0,
		)
	) {
		throw new RecaseError({
			message:
				"Customer already has a product from a different processor than RevenueCat.",
		});
	}

	const cusProducts = customer.customer_products.filter(
		(cp) =>
			cp.processor?.type === ProcessorType.RevenueCat || cp.product.is_default,
	);

	ctx.customerId = customer.id ?? "";
	ctx.rolloutSnapshot = computeRolloutSnapshot({
		orgId: ctx.org.id,
		customerId: ctx.customerId,
	});
	const { ctx: routedCtx } = getCtxWithCustomerRedis({
		ctx,
		customerId: ctx.customerId,
	});

	return { ctx: routedCtx, product, customer, cusProducts, featureQuantities };
};
