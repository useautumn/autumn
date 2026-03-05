import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";
import type { AutoTopupContext } from "../autoTopupContext";

export const logAutoTopupContext = ({
	ctx,
	autoTopupContext,
}: {
	ctx: AutumnContext;
	autoTopupContext: AutoTopupContext;
}) => {
	const { autoTopupConfig, customerEntitlement, fullCustomer, stripeCustomer } =
		autoTopupContext;

	const cusProduct = customerEntitlement.customer_product;
	const feature = customerEntitlement.entitlement.feature;

	addToExtraLogs({
		ctx,
		extras: {
			autoTopupContext: {
				customer: `${fullCustomer.id} (${fullCustomer.internal_id})`,
				stripeCustomer: stripeCustomer?.id ?? "none",

				feature: `${feature.id} (${feature.internal_id})`,
				customerEntitlement: `${customerEntitlement.id} | balance: ${customerEntitlement.balance}`,
				customerProduct: cusProduct?.id ?? "none",
				product: cusProduct?.product?.id ?? "none",

				config: {
					enabled: autoTopupConfig.enabled,
					threshold: autoTopupConfig.threshold,
					quantity: autoTopupConfig.quantity,
					purchaseLimit: autoTopupConfig.purchase_limit
						? `${autoTopupConfig.purchase_limit.limit}/${autoTopupConfig.purchase_limit.interval}`
						: "none",
				},
			},
		},
	});
};
