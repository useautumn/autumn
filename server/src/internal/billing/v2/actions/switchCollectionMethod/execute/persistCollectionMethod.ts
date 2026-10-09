import { CollectionMethod } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import type { SwitchCollectionMethodContext } from "../setup/setupSwitchCollectionMethodContext";

/** Customer products billed on the same Stripe subscription switch together. */
const customerProductsOnSubscription = ({
	switchContext,
}: {
	switchContext: SwitchCollectionMethodContext;
}) => {
	const { fullCustomer, customerProduct, stripeSubscription } = switchContext;
	if (!stripeSubscription) return [customerProduct];

	return fullCustomer.customer_products.filter((cp) =>
		cp.subscription_ids?.includes(stripeSubscription.id),
	);
};

export const persistCollectionMethod = async ({
	ctx,
	switchContext,
}: {
	ctx: AutumnContext;
	switchContext: SwitchCollectionMethodContext;
}) => {
	const { fullCustomer, targetCollectionMethod, applyToAutoTopups } =
		switchContext;

	await Promise.all(
		customerProductsOnSubscription({ switchContext }).map((cp) =>
			CusProductService.update({
				ctx,
				cusProductId: cp.id,
				updates: { collection_method: targetCollectionMethod },
			}),
		),
	);

	if (applyToAutoTopups && fullCustomer.auto_topups?.length) {
		await CusService.update({
			ctx,
			idOrInternalId: fullCustomer.internal_id,
			update: {
				auto_topups: fullCustomer.auto_topups.map((autoTopup) => ({
					...autoTopup,
					invoice_mode: targetCollectionMethod === CollectionMethod.SendInvoice,
				})),
			},
		});
	}

	await invalidateCachedFullSubject({
		ctx,
		customerId: fullCustomer.id ?? fullCustomer.internal_id,
		source: "switchCollectionMethod",
	});
};
