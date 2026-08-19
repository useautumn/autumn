import type { FullProduct } from "@autumn/shared";

/** Plan-license clones spread the child at compute time; child init replaces processor on the live row only. */
export const hydratePlanLicenseProcessor = ({
	product,
	catalogByInternalId,
}: {
	product: FullProduct;
	catalogByInternalId: Map<string, FullProduct>;
}) => {
	for (const planLicense of product.licenses ?? []) {
		const child = catalogByInternalId.get(planLicense.product.internal_id);
		if (!child?.processor) continue;
		planLicense.product.processor = child.processor;
	}
};
