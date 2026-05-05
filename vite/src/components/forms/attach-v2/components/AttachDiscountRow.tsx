import { DiscountRow } from "@/components/forms/shared/discount-row/DiscountRow";
import { useAttachFormContext } from "../context/AttachFormProvider";
import { removeDiscount, updateDiscount } from "../utils/discountUtils";

export function AttachDiscountRow({ index }: { index: number }) {
	const { form, formValues, product } = useAttachFormContext();
	const discounts = formValues.discounts;

	return (
		<DiscountRow
			discounts={discounts}
			index={index}
			productId={product?.id}
			onUpdate={({ rewardId }) => {
				form.setFieldValue(
					"discounts",
					updateDiscount(discounts, index, { reward_id: rewardId }),
				);
			}}
			onRemove={() => {
				form.setFieldValue("discounts", removeDiscount(discounts, index));
			}}
		/>
	);
}
