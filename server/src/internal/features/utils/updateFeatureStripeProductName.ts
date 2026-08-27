import type { Feature } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { isStripeConnected } from "@/internal/orgs/orgUtils.js";

export const updateFeatureStripeProductName = async ({
	ctx,
	feature,
}: {
	ctx: AutumnContext;
	feature: Feature;
}) => {
	if (!feature.stripe_product_id || !feature.name) return;
	if (!isStripeConnected({ org: ctx.org, env: ctx.env })) return;

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	try {
		const live = await stripeCli.products.retrieve(feature.stripe_product_id);
		if (!live.active) return;
		await stripeCli.products.update(live.id, { name: feature.name });
	} catch {
		return;
	}
};
