import { notNullish } from "@autumn/shared";
import {
	Input,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	SheetAccordion,
	SheetAccordionItem,
	Switch,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@autumn/ui";
import { useState } from "react";
import { useParams } from "react-router";
import { hasBillingControls } from "@/components/billing-controls/BillingControlsDisplay";
import { ConfigRow } from "@/components/forms/shared/ConfigRow";
import { useProduct } from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { useProductsQuery } from "@/hooks/queries/useProductsQuery";
import { MetadataEditor } from "./MetadataEditor";
import { PlanBillingControlsSection } from "./PlanBillingControlsSection";

const NO_BASE_PLAN = "__none__";

export const MoreSettingsSection = () => {
	const { product, setProduct } = useProduct();
	const { customer_id } = useParams();
	const isCustomPlan = notNullish(customer_id);
	const { products } = useProductsQuery();

	const hasGroup = notNullish(product.group);
	const currentListProduct = products.find((p) => p.id === product.id);
	const selectedBasePlanId =
		product.base_id ?? currentListProduct?.base_id ?? null;
	const basePlanOptions = products.filter(
		(p) => p.id !== product.id && !p.base_id,
	);
	const selectedBasePlan = products.find((p) => p.id === selectedBasePlanId);
	const hasSelectedBaseOption = basePlanOptions.some(
		(p) => p.id === selectedBasePlanId,
	);
	const visibleBasePlanOptions =
		selectedBasePlan && !hasSelectedBaseOption
			? [selectedBasePlan, ...basePlanOptions]
			: basePlanOptions;
	const hasVariantBase = selectedBasePlanId !== null;
	const canSelectBasePlan = visibleBasePlanOptions.length > 0;

	const hasMetadata = Object.keys(product.metadata ?? {}).length > 0;
	const [metadataOpened, setMetadataOpened] = useState(false);
	const showMetadata = hasMetadata || metadataOpened;

	const hasBillingControlsConfigured = hasBillingControls(
		product.billing_controls,
	);
	const [billingControlsOpened, setBillingControlsOpened] = useState(false);
	const showBillingControls =
		hasBillingControlsConfigured || billingControlsOpened;

	if (!product.planType) return null;

	return (
		<SheetAccordion type="single" withSeparator={false}>
			<SheetAccordionItem
				value="more-settings"
				title="More settings"
				titleClassName="text-tertiary-foreground"
			>
				<div className="space-y-5">
					<ConfigRow
						title="Group"
						description="Assign the plan to a subscription tier group."
						expanded={hasGroup}
						action={
							<Switch
								checked={hasGroup}
								onCheckedChange={(checked) =>
									setProduct({ ...product, group: checked ? "" : null })
								}
							/>
						}
					>
						<Input
							placeholder="Enter group name"
							value={product.group ?? undefined}
							onChange={(e) =>
								setProduct({ ...product, group: e.target.value })
							}
						/>
					</ConfigRow>

					<ConfigRow
						title="Ignore past due"
						description="Exclude this plan from any auto-cancellation behavior"
						action={
							<Switch
								checked={!!product.config?.ignore_past_due}
								onCheckedChange={(checked) =>
									setProduct({
										...product,
										config: { ...product.config, ignore_past_due: checked },
									})
								}
							/>
						}
					/>

					{!isCustomPlan && (
						<ConfigRow
							title="Base plan"
							description="Link this plan as a variant of another plan."
							expanded={hasVariantBase}
							action={
								<Switch
									checked={hasVariantBase}
									disabled={!hasVariantBase && !canSelectBasePlan}
									onCheckedChange={(checked) => {
										setProduct({
											...product,
											base_id: checked
												? (selectedBasePlanId ??
													visibleBasePlanOptions[0]?.id ??
													null)
												: null,
										});
									}}
								/>
							}
						>
							<Select
								value={selectedBasePlanId ?? NO_BASE_PLAN}
								onValueChange={(value) => {
									setProduct({
										...product,
										base_id: value === NO_BASE_PLAN ? null : value,
									});
								}}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Select base plan" />
								</SelectTrigger>
								<SelectContent>
									{visibleBasePlanOptions.map((basePlan) => (
										<SelectItem key={basePlan.id} value={basePlan.id}>
											{basePlan.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</ConfigRow>
					)}

					{isCustomPlan ? (
						<ConfigRow
							title="Billing controls"
							description="Default controls applied when this plan is attached."
							action={
								<Tooltip>
									<TooltipTrigger asChild>
										<div>
											<Switch checked={false} disabled />
										</div>
									</TooltipTrigger>
									<TooltipContent side="left" className="max-w-60">
										Billing controls can't be set per subscription. Edit the
										customer's billing controls to change them for this
										customer, or the plan to change the default.
									</TooltipContent>
								</Tooltip>
							}
						/>
					) : (
						<ConfigRow
							title="Billing controls"
							description="Default controls applied when this plan is attached."
							expanded={showBillingControls}
							action={
								<Switch
									checked={showBillingControls}
									onCheckedChange={(checked) => {
										if (checked) {
											setBillingControlsOpened(true);
										} else {
											setBillingControlsOpened(false);
											setProduct({ ...product, billing_controls: {} });
										}
									}}
								/>
							}
						>
							<PlanBillingControlsSection hideHeader />
						</ConfigRow>
					)}

					<ConfigRow
						title="Metadata"
						description="Custom JSON, shared across all plan versions."
						expanded={showMetadata}
						action={
							<Switch
								checked={showMetadata}
								onCheckedChange={(checked) => {
									if (checked) {
										setMetadataOpened(true);
									} else {
										setMetadataOpened(false);
										setProduct({ ...product, metadata: {} });
									}
								}}
							/>
						}
					>
						<MetadataEditor key={product.internal_id ?? product.id} />
					</ConfigRow>
				</div>
			</SheetAccordionItem>
		</SheetAccordion>
	);
};
