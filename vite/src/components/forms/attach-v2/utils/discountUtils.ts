import type { AttachDiscount } from "@autumn/shared";

export type DiscountMode = "reward" | "promo";

/** Form discount with unique ID for stable React keys */
export type FormDiscount = AttachDiscount & { _id: string };

let discountIdCounter = 0;
const generateDiscountId = (): string => {
	discountIdCounter += 1;
	return `discount-${discountIdCounter}-${Date.now()}`;
};

export const getDiscountMode = (discount: FormDiscount): DiscountMode => {
	return "reward_id" in discount ? "reward" : "promo";
};

export const createDiscount = (mode: DiscountMode): FormDiscount => {
	const base = mode === "reward" ? { reward_id: "" } : { promotion_code: "" };
	return { ...base, _id: generateDiscountId() };
};

export const addDiscount = (discounts: FormDiscount[]): FormDiscount[] => {
	return [...discounts, createDiscount("reward")];
};

export const removeDiscount = (
	discounts: FormDiscount[],
	index: number,
): FormDiscount[] => {
	return discounts.filter((_, i) => i !== index);
};

export const updateDiscount = (
	discounts: FormDiscount[],
	index: number,
	updates: AttachDiscount,
): FormDiscount[] => {
	const newDiscounts = [...discounts];
	const existing = newDiscounts[index];
	newDiscounts[index] = { ...updates, _id: existing._id } as FormDiscount;
	return newDiscounts;
};

export const toggleDiscountMode = (
	discounts: FormDiscount[],
	index: number,
	newMode: DiscountMode,
): FormDiscount[] => {
	const base =
		newMode === "reward" ? { reward_id: "" } : { promotion_code: "" };
	return updateDiscount(discounts, index, base);
};

/** Converts form discounts to API format (strips _id) */
export const toApiDiscounts = (discounts: FormDiscount[]): AttachDiscount[] => {
	return discounts.map(({ _id, ...rest }) => rest);
};

/** Filters out empty/invalid discounts before sending to API */
export const filterValidDiscounts = (
	discounts: FormDiscount[],
): AttachDiscount[] => {
	return toApiDiscounts(
		discounts.filter((d) => {
			if ("reward_id" in d) return d.reward_id !== "";
			if ("promotion_code" in d) return d.promotion_code !== "";
			return false;
		}),
	);
};
