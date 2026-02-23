import { AppEnv } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { cusProductToSub } from "@/internal/customers/cusProducts/cusProductUtils/convertCusProduct.js";

export const getCusSub = async ({
	ctx,
	customerId,
	productId,
}: {
	ctx: AutumnContext;
	customerId: string;
	productId: string;
}) => {
	const { org } = ctx;
	const env = AppEnv.Sandbox;
	const stripeCli = createStripeCli({ org, env });
	const fullCus = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const cusProduct = fullCus.customer_products.find(
		(cp) => cp.product.id === productId,
	);

	const sub = await cusProductToSub({ cusProduct, stripeCli });
	return sub;
};
