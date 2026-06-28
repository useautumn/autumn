import type { FullProduct, UpdateProductV2Params } from "@autumn/shared";

const propagatedSettingFields = [
	"name",
	"description",
	"group",
	"is_add_on",
	"config",
	"billing_controls",
	"metadata",
] as const satisfies readonly (keyof UpdateProductV2Params)[];

export const shouldApplyVariantUpdates = ({
	oldBase,
	latestBase,
	propagateToVariants,
	variantUpdates,
	updates,
}: {
	oldBase: FullProduct;
	latestBase: FullProduct;
	propagateToVariants: string[];
	variantUpdates: unknown[];
	updates: UpdateProductV2Params;
}) => {
	if (propagateToVariants.length > 0 || variantUpdates.length > 0) return true;
	if (oldBase.internal_id !== latestBase.internal_id) return true;

	return propagatedSettingFields.some((field) => updates[field] !== undefined);
};
