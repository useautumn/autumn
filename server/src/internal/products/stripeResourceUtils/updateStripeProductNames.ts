import type {
	AppEnv,
	AutumnLogger,
	FullProduct,
	Organization,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { isStripeConnected } from "@/internal/orgs/orgUtils.js";

/**
 * Sync a plan rename onto its owned Stripe Product.
 * Callers guard variant rows — a variant shares its base's Stripe Product.
 * Per-feature Stripe Products are renamed from the feature, not the plan.
 */
export const updateStripeProductNames = async ({
	org,
	curProduct,
	newName,
	logger,
}: {
	org: Organization;
	curProduct: FullProduct;
	newName: string;
	logger: AutumnLogger;
}) => {
	if (!isStripeConnected({ org, env: curProduct.env as AppEnv })) return;

	const stripeCli = createStripeCli({
		org,
		env: curProduct.env as AppEnv,
	});
	const stripeProdId = curProduct.processor?.id;

	if (!stripeProdId || !newName) {
		return;
	}

	try {
		await stripeCli.products.update(stripeProdId, {
			name: newName,
		});
	} catch (error: any) {
		logger.error(
			`Error updating product ${curProduct.id} name in Stripe: ${error.message}`,
			{
				error,
				stripeProdId,
				newName,
			},
		);
	}
};
