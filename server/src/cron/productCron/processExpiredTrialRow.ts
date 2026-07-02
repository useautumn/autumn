import {
	CusProductStatus,
	type customerProducts,
	type customers,
	type FullCusProduct,
	type FullProduct,
} from "@autumn/shared";
import { customerProductToDefaultProduct } from "@utils/cusProductUtils/convertCusProduct/customerProductToDefaultProduct";
import type { InferSelectModel } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { sendBillingUpdatedWebhook } from "@/internal/billing/v2/workflows/sendBillingUpdatedWebhook/sendBillingUpdatedWebhook";
import { CusService } from "@/internal/customers/CusService";
import { activateFreeDefaultProduct } from "@/internal/customers/cusProducts/actions/activateFreeDefaultProduct";
import { tryProcessRevertExpiry } from "@/internal/customers/cusProducts/actions/revertTrialExpiry";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer";
import { transitionLicenseAssignmentsForParents } from "@/internal/licenses/actions/transitionLicenseAssignments";

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

	const trialFullCusProduct = fullCustomer.customer_products.find(
		(cp) => cp.id === customerProduct.id,
	);
	if (!trialFullCusProduct) return;

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
			fullCustomer,
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

	await transitionLicenseAssignmentsForParents({
		ctx,
		customerId: fullCustomer.id || fullCustomer.internal_id,
		parentCustomerProductIds: [trialFullCusProduct.id],
	});

	await deleteCachedFullCustomer({
		ctx,
		customerId: fullCustomer.id ?? "",
		source: "productCron",
	});

	void sendBillingUpdatedWebhook({
		ctx,
		autumnBillingPlan: {
			customerId: fullCustomer.id ?? fullCustomer.internal_id,
			insertCustomerProducts: activatedDefault ? [activatedDefault] : [],
			updateCustomerProducts: [
				{
					customerProduct: trialFullCusProduct,
					updates: { status: CusProductStatus.Expired },
				},
			],
		},
		originalFullCustomer: fullCustomer,
		tags: ["trial_ended"],
	});
};
