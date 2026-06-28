import {
	ErrCode,
	type FullProduct,
	type ProductV2,
	RecaseError,
	type UpdateProductV2Params,
} from "@autumn/shared";

const variantSettingsFields = [
	"description",
	"group",
	"is_add_on",
	"is_default",
	"config",
	"billing_controls",
	"metadata",
] as const satisfies readonly (keyof UpdateProductV2Params)[];

const normalizeVariantSettingValue = ({
	field,
	value,
}: {
	field: (typeof variantSettingsFields)[number];
	value: unknown;
}) => {
	if (field === "group") return value || "";
	if (field === "description") return value ?? null;
	if (["config", "billing_controls", "metadata"].includes(field)) {
		return JSON.stringify(value ?? {});
	}
	return value;
};

export const validateVariantSettingsUpdate = ({
	allowVariantSettingsUpdate,
	fullProduct,
	currentProduct,
	updates,
}: {
	allowVariantSettingsUpdate: boolean;
	fullProduct: FullProduct;
	currentProduct: ProductV2;
	updates: UpdateProductV2Params;
}) => {
	if (
		allowVariantSettingsUpdate ||
		fullProduct.base_internal_product_id == null
	) {
		return;
	}

	const blockedField = variantSettingsFields.find((field) => {
		if (updates[field] === undefined) return false;
		return (
			normalizeVariantSettingValue({ field, value: updates[field] }) !==
			normalizeVariantSettingValue({ field, value: currentProduct[field] })
		);
	});
	if (!blockedField) return;

	throw new RecaseError({
		message: `Cannot update ${blockedField} directly on a variant plan.`,
		code: ErrCode.InvalidPropagationTarget,
		statusCode: 400,
	});
};
