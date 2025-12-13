import {
	type FullCustomer,
	getTargetSubscriptionCusProduct,
	type Product,
} from "@autumn/shared";
import { createStripeCli } from "../../../external/connect/createStripeCli";
import type { AutumnContext } from "../../../honoUtils/HonoEnv";

export const getAttachSub = async ({
	ctx,
	fullCus,
	products,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	products: Product[];
}) => {
	const { org, env } = ctx;
	const stripeCli = createStripeCli({ org, env });

	const cusProductWithSub = getTargetSubscriptionCusProduct({
		fullCus,
		productId: products[0].id,
		productGroup: products[0].group,
	});

	const subId = cusProductWithSub?.subscription_ids?.[0];

	if (!subId) return { sub: undefined };

	const sub = await stripeCli.subscriptions.retrieve(subId);

	return { sub };
};
