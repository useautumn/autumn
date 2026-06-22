import { PlusIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import {
	addDiscount,
	removeDiscount,
	updateDiscount,
} from "@/components/forms/attach-v2/utils/discountUtils";
import {
	AdvancedSection,
	ConfigRow,
} from "@/components/forms/shared/advanced-section";
import { DiscountRow } from "@/components/forms/shared/discount-row/DiscountRow";
import { Switch } from "@/components/ui/switch";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { useUpdateSubscriptionFormContext } from "../context/UpdateSubscriptionFormProvider";

export function UpdateSubscriptionAdvancedSection() {
	const { form, formValues, formContext } = useUpdateSubscriptionFormContext();
	const {
		billingBehavior,
		resetBillingCycle,
		resetUsage,
		noBillingChanges,
		discounts,
	} = formValues;
	const { customerProduct, product } = formContext;

	const hasActiveSubscription =
		(customerProduct.subscription_ids?.length ?? 0) > 0;
	const isProrate = billingBehavior !== "none";

	const handleAddDiscount = () => {
		form.setFieldValue("discounts", addDiscount(discounts));
	};

	return (
		<AdvancedSection>
			<ConfigRow
				title="Discounts"
				description="Apply percentage or fixed-amount discounts to this subscription"
				action={
					<IconButton
						variant="muted"
						size="sm"
						onClick={handleAddDiscount}
						icon={<PlusIcon size={12} />}
						className="text-tertiary-foreground"
					>
						Add
					</IconButton>
				}
			>
				{discounts.length > 0 && (
					<div className="space-y-2">
						<AnimatePresence initial={false} mode="popLayout">
							{discounts.map((discount, index) => (
								<motion.div
									key={discount._id}
									initial={{ opacity: 0, scale: 0.95 }}
									animate={{ opacity: 1, scale: 1 }}
									exit={{ opacity: 0, scale: 0.95 }}
									transition={{ duration: 0.15 }}
								>
									<DiscountRow
										discounts={discounts}
										index={index}
										productId={product?.id}
										onUpdate={({ rewardId }) => {
											form.setFieldValue(
												"discounts",
												updateDiscount(discounts, index, {
													reward_id: rewardId,
												}),
											);
										}}
										onRemove={() => {
											form.setFieldValue(
												"discounts",
												removeDiscount(discounts, index),
											);
										}}
									/>
								</motion.div>
							))}
						</AnimatePresence>
					</div>
				)}
			</ConfigRow>

			{hasActiveSubscription && (
				<>
					<ConfigRow
						title="Prorate Changes"
						description="Prorate price differences when changing plans mid-cycle"
						action={
							<Switch
								checked={isProrate}
								onCheckedChange={(checked) =>
									form.setFieldValue("billingBehavior", checked ? null : "none")
								}
							/>
						}
					/>
					<ConfigRow
						title="No Billing Changes"
						description="Update subscription state without applying Stripe billing changes"
						action={
							<Switch
								checked={noBillingChanges}
								onCheckedChange={(checked) =>
									form.setFieldValue("noBillingChanges", !!checked)
								}
							/>
						}
					/>
					<ConfigRow
						title="Reset Billing Cycle"
						description="Restart the billing cycle from today"
						action={
							<Switch
								checked={resetBillingCycle}
								onCheckedChange={(checked) =>
									form.setFieldValue("resetBillingCycle", !!checked)
								}
							/>
						}
					/>
					<ConfigRow
						title="Reset Usage"
						description="Reset feature balances instead of carrying usage to the new plan"
						action={
							<Switch
								checked={resetUsage}
								onCheckedChange={(checked) =>
									form.setFieldValue("resetUsage", !!checked)
								}
							/>
						}
					/>
				</>
			)}
		</AdvancedSection>
	);
}
