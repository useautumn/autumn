import {
	CusProductStatus,
	type customerProducts,
	type customers,
	type FullCusProduct,
	type FullProduct,
} from "@autumn/shared";
import { customerProductToDefaultProduct } from "@utils/cusProductUtils/convertCusProduct/customerProductToDefaultProduct";
import type { InferSelectModel } from "drizzle-orm";
import { withLock } from "@/external/redis/redisUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildBillingLockKey } from "@/internal/billing/v2/utils/billingLock/buildBillingLockKey.js";
import { sendBillingUpdatedWebhook } from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/sendBillingUpdatedWebhook";
import { CusService } from "@/internal/customers/CusService";
import { activateFreeDefaultProduct } from "@/internal/customers/cusProducts/actions/activateFreeDefaultProduct";
import { tryProcessRevertExpiry } from "@/internal/customers/cusProducts/actions/revertTrialExpiry";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { afterLicenseMutation } from "@/internal/licenses/actions/reconcile/afterLicenseMutation.js";

export const processExpiredTrialRow = async ({
	ctx,
	customerProduct,
	customer,
	defaultProducts,
}: {
	ctx: AutumnContext;
	customerProduct: InferSelectModel<typeof customerProducts>;
	customer: InferSelectModel<typeof customers>;
	defaultProducts: FullProduct[];
}) => {
	// Revert path owns its own webhook emission.
	const reverted = await tryProcessRevertExpiry({
		ctx,
		customerProduct,
		customerId: customer.id ?? "",
	});
	if (reverted) return;

	// Standard path: snapshot fullCustomer BEFORE mutations so the webhook
	// payload reflects pre-expiry state in `previous_attributes`. Default
	// RELEVANT_STATUSES is sufficient — the trial cusProduct is Active
	// (with a past trial_ends_at) at this point.
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customer.internal_id,
		withEntities: true,
		withSubs: true,
	});

	const customerPageTrialCusProduct = fullCustomer.customer_products.find(
		(cp) => cp.id === customerProduct.id,
	);
	const trialFullCusProduct =
		customerPageTrialCusProduct ??
		(await CusProductService.getFull({
			db: ctx.db,
			id: customerProduct.id,
			inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
		}));
	if (!trialFullCusProduct) return;

	const originalFullCustomer = customerPageTrialCusProduct
		? fullCustomer
		: {
				...fullCustomer,
				customer_products: [
					...fullCustomer.customer_products,
					trialFullCusProduct,
				],
			};

	const defaultProduct = customerProductToDefaultProduct({
		ctx,
		customerProduct: trialFullCusProduct,
		defaultProducts,
	});

	let activatedDefault: FullCusProduct | undefined;
	if (defaultProduct) {
		activatedDefault = await activateFreeDefaultProduct({
			ctx,
			customerProduct: trialFullCusProduct,
			fullCustomer: originalFullCustomer,
			defaultProduct,
		});
	}
	await CusProductService.update({
		ctx,
		cusProductId: trialFullCusProduct.id,
		updates: {
			status: CusProductStatus.Expired,
		},
	});

	await withLock({
		lockKey: buildBillingLockKey({
			orgId: ctx.org.id,
			env: ctx.env,
			customerId: fullCustomer.id || fullCustomer.internal_id,
		}),
		ttlMs: 120000,
		fn: async () =>
			afterLicenseMutation({
				ctx,
				customerId: fullCustomer.id || fullCustomer.internal_id,
				internalCustomerId: fullCustomer.internal_id,
			}),
	});

	await deleteCachedFullCustomer({
		ctx,
		customerId: fullCustomer.id ?? "",
		source: "productCron",
	});

	void sendBillingUpdatedWebhook({
		ctx,
		autumnBillingPlan: {
			customerId: originalFullCustomer.id ?? originalFullCustomer.internal_id,
			insertCustomerProducts: activatedDefault ? [activatedDefault] : [],
			updateCustomerProducts: [
				{
					customerProduct: trialFullCusProduct,
					updates: { status: CusProductStatus.Expired },
				},
			],
		},
		originalFullCustomer,
		tags: ["trial_ended"],
	});
};
