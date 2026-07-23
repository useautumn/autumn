import {
	ErrCode,
	type FullProduct,
	ProductConfigSchema,
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

// Order-insensitive canonical form: DB stores billing_controls in one key/array
// order while the editor re-serializes it in another, so a plain JSON.stringify
// falsely reports a change when nothing meaningful differs.
const sortDeep = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(sortDeep);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.keys(value as Record<string, unknown>)
				.sort()
				.map((key) => [key, sortDeep((value as Record<string, unknown>)[key])]),
		);
	}
	return value;
};

const canonicalizeBillingControls = (value: unknown): string => {
	const source = (value ?? {}) as Record<string, unknown>;
	const normalized: Record<string, unknown> = {};
	for (const key of Object.keys(source)) {
		const entries = source[key];
		// Treat an absent key and an empty array as the same "no controls" state.
		if (Array.isArray(entries) && entries.length === 0) continue;
		normalized[key] = Array.isArray(entries)
			? [...entries].sort((a, b) =>
					String(
						(a as { feature_id?: string })?.feature_id ?? "",
					).localeCompare(
						String((b as { feature_id?: string })?.feature_id ?? ""),
					),
				)
			: entries;
	}
	return JSON.stringify(sortDeep(normalized));
};

const normalizeVariantSettingValue = ({
	field,
	value,
}: {
	field: (typeof variantSettingsFields)[number];
	value: unknown;
}) => {
	if (field === "group") return value || "";
	// Treat "" and null/undefined as the same empty description; the editor sends
	// "" while a description-less plan stores null, which isn't a real change.
	if (field === "description") return value || null;
	if (field === "billing_controls") return canonicalizeBillingControls(value);
	// The read path defaults config through ProductConfigSchema (so the editor
	// echoes back {ignore_past_due:false}) while the DB stores a bare {}. Parse
	// both sides so those defaults line up and don't read as a change.
	if (field === "config") {
		const parsed = ProductConfigSchema.safeParse(value ?? {});
		return JSON.stringify(sortDeep(parsed.success ? parsed.data : (value ?? {})));
	}
	if (field === "metadata") {
		return JSON.stringify(sortDeep(value ?? {}));
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
