import { Switch } from "@autumn/ui";
import {
	addDiscount,
	removeDiscount,
	updateDiscount,
} from "@/components/forms/attach-v2/utils/discountUtils";
import {
	AdvancedSection,
	ConfigRow,
} from "@/components/forms/shared/advanced-section";
import { BillingOptionToggle } from "@/components/forms/shared/BillingOptionToggle";
import { DiscountsConfigRow } from "@/components/forms/shared/discount-row/DiscountsConfigRow";
import { getBillingOptionRules } from "@/components/forms/shared/utils/billingOptionRules";
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

	const rules = getBillingOptionRules({
		flow: "update",
		state: {
			hasActiveSubscription:
				(customerProduct.subscription_ids?.length ?? 0) > 0,
		},
	});
	const isProrate = billingBehavior !== "none";

	return (
		<AdvancedSection>
			<DiscountsConfigRow
				discounts={discounts}
				description="Apply percentage or fixed-amount discounts to this subscription"
				productId={product?.id}
				onAdd={() => form.setFieldValue("discounts", addDiscount(discounts))}
				onUpdate={({ index, rewardId }) =>
					form.setFieldValue(
						"discounts",
						updateDiscount(discounts, index, { reward_id: rewardId }),
					)
				}
				onRemove={({ index }) =>
					form.setFieldValue("discounts", removeDiscount(discounts, index))
				}
			/>

			{rules.proration.visible && (
				<>
					<ConfigRow
						title="Prorate Changes"
						description="Prorate price differences when changing plans mid-cycle"
						action={
							<BillingOptionToggle
								rule={rules.proration}
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
