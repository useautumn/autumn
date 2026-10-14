import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import type { SwitchCollectionMethodContext } from "../setup/setupSwitchCollectionMethodContext";

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
	const { fullCustomer, targetCollectionMethod } = switchContext;

	await Promise.all(
		customerProductsOnSubscription({ switchContext }).map((cp) =>
			CusProductService.update({
				ctx,
				cusProductId: cp.id,
				updates: { collection_method: targetCollectionMethod },
			}),
		),
	);

	await invalidateCachedFullSubject({
		ctx,
		customerId: fullCustomer.id ?? fullCustomer.internal_id,
		source: "switchCollectionMethod",
	});
};
