import type { AttachDiscount, RemoveDiscount } from "@autumn/shared";
import { z } from "zod/v4";

export type DiscountMode = "reward" | "promo";

/** Form discount with unique ID for stable React keys */
export type FormDiscount = AttachDiscount & { _id: string };

/** New discount rows, plus the applied discounts marked for removal. */
export const DiscountsFormFieldsSchema = z.object({
	discounts: z.custom<FormDiscount[]>(),
	removedRewardIds: z.array(z.string()),
});

export type DiscountsFormFields = z.infer<typeof DiscountsFormFieldsSchema>;

export const EMPTY_DISCOUNTS_FORM_VALUES: DiscountsFormFields = {
	discounts: [],
	removedRewardIds: [],
};

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

export const toggleRemovedRewardId = ({
	removedRewardIds,
	rewardId,
}: {
	removedRewardIds: string[];
	rewardId: string;
}): string[] =>
	removedRewardIds.includes(rewardId)
		? removedRewardIds.filter((id) => id !== rewardId)
		: [...removedRewardIds, rewardId];

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

/** Only what changed: picked rows go to `discounts`, marked ones to `remove_discounts`, untouched ones are left to the server. */
export const buildDiscountParams = ({
	discounts,
	removedRewardIds,
}: DiscountsFormFields): {
	discounts?: AttachDiscount[];
	remove_discounts?: RemoveDiscount[];
} => {
	const addedDiscounts = filterValidDiscounts(discounts);
	return {
		...(addedDiscounts.length > 0 && { discounts: addedDiscounts }),
		...(removedRewardIds.length > 0 && {
			remove_discounts: removedRewardIds.map((rewardId) => ({
				reward_id: rewardId,
			})),
		}),
	};
};
