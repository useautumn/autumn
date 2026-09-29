import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const createMappingStripeProduct = async ({
	ctx,
	name,
}: {
	ctx: AutumnContext;
	name: string;
}) => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const stripeProduct = await stripeCli.products.create({ name });
	return stripeProduct.id;
};
