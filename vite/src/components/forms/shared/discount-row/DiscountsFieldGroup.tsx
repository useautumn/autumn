import type { ApiDiscount } from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import {
	addDiscount,
	EMPTY_DISCOUNTS_FORM_VALUES,
	removeDiscount,
	toggleRemovedRewardId,
	updateDiscount,
} from "@/components/forms/shared/utils/discountUtils";
import { withFieldGroup } from "@/hooks/form/form";
import { AppliedDiscountRow } from "./AppliedDiscountRow";
import { DiscountsConfigRow } from "./DiscountsConfigRow";

const discountsProps: {
	description: string;
	productId: string | undefined;
	appliedDiscounts: ApiDiscount[];
} = {
	description: "",
	productId: undefined,
	appliedDiscounts: [],
};

/** New discounts plus remove toggles for the ones already on the subscription. */
export const DiscountsFieldGroup = withFieldGroup({
	defaultValues: EMPTY_DISCOUNTS_FORM_VALUES,
	props: discountsProps,
	render: function DiscountsFieldGroupRender({
		group,
		description,
		productId,
		appliedDiscounts,
	}) {
		const { discounts, removedRewardIds } = useStore(
			group.store,
			(state) => state.values,
		);
		const removedIds = new Set(removedRewardIds);

		return (
			<DiscountsConfigRow
				discounts={discounts}
				description={description}
				productId={productId}
				onAdd={() => group.setFieldValue("discounts", addDiscount(discounts))}
				onUpdate={({ index, rewardId }) =>
					group.setFieldValue(
						"discounts",
						updateDiscount(discounts, index, { reward_id: rewardId }),
					)
				}
				onRemove={({ index }) =>
					group.setFieldValue("discounts", removeDiscount(discounts, index))
				}
				excludedRewardIds={appliedDiscounts.map((discount) => discount.id)}
				appliedDiscounts={appliedDiscounts.map((discount) => (
					<AppliedDiscountRow
						key={discount.id}
						discount={discount}
						removed={removedIds.has(discount.id)}
						onToggleRemoved={() =>
							group.setFieldValue(
								"removedRewardIds",
								toggleRemovedRewardId({
									removedRewardIds,
									rewardId: discount.id,
								}),
							)
						}
					/>
				))}
			/>
		);
	},
});

export const DISCOUNTS_FIELDS = {
	discounts: "discounts",
	removedRewardIds: "removedRewardIds",
} as const;
