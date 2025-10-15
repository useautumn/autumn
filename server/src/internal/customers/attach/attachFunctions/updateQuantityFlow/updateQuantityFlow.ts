import { type AttachConfig, SuccessCode } from "@autumn/shared";
import type Stripe from "stripe";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import {
	type AttachParams,
	AttachResultSchema,
} from "../../../cusProducts/AttachParams.js";
import { attachParamToCusProducts } from "../../attachUtils/convertAttachParams.js";
import { handleUpdateFeatureQuantity } from "./updateFeatureQuantity.js";

export const handleUpdateQuantityFunction = async ({
	req,
	res,
	attachParams,
	config,
}: {
	req: any;
	res: any;
	attachParams: AttachParams;
	config: AttachConfig;
}) => {
	// 2. Update quantities
	const optionsToUpdate = attachParams.optionsToUpdate!;
	const { customer } = attachParams;
	const { curSameProduct } = attachParamToCusProducts({ attachParams });

	// Check balance of each option to update...?
	const stripeCli = attachParams.stripeCli;
	const cusProduct = curSameProduct!;
	const stripeSubs = await getStripeSubs({
		stripeCli: stripeCli,
		subIds: cusProduct.subscription_ids || [],
	});

	const invoices: Stripe.Invoice[] = [];
	for (const options of optionsToUpdate) {
		const result = await handleUpdateFeatureQuantity({
			req,
			attachParams,
			attachConfig: config,
			cusProduct,
			stripeSubs,
			oldOptions: options.old,
			newOptions: options.new,
		});

		if (result?.invoice) {
			invoices.push(result.invoice);
		}
	}

	await CusProductService.update({
		db: req.db,
		cusProductId: cusProduct.id,
		updates: { options: optionsToUpdate.map((o) => o.new) },
	});

	res.status(200).json(
		AttachResultSchema.parse({
			customer_id: customer.id || customer.internal_id,
			product_ids: attachParams.products.map((p) => p.id),
			invoice:
				config.invoiceOnly && invoices.length > 0 ? invoices[0] : undefined,
			code: SuccessCode.FeaturesUpdated,
			message: `Successfully updated quantity for features: ${optionsToUpdate.map((o) => o.new.feature_id).join(", ")}`,
		}),
	);
};
