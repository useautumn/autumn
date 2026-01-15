import type {
	Feature,
	FullCusProduct,
	ProductItem,
	ProductV2,
} from "@autumn/shared";
import { featureToOptions, UsageModel } from "@autumn/shared";
import { InfoIcon, PencilSimpleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/v2/buttons/Button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/v2/selects/Select";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { BasePriceDisplay } from "@/views/products/plan/components/plan-card/BasePriceDisplay";
import { PlanFeatureRow } from "@/views/products/plan/components/plan-card/PlanFeatureRow";
import type { UseUpdateSubscriptionForm } from "../hooks/useUpdateSubscriptionForm";

interface EditPlanSectionProps {
	hasCustomizations: boolean;
	onEditPlan: () => void;
	product?: ProductV2;
	customerProduct?: FullCusProduct;
	features?: Feature[];
	form?: UseUpdateSubscriptionForm;
	numVersions?: number;
	currentVersion?: number;
}

function SectionTitle({
	hasCustomizations,
	form,
	numVersions,
	currentVersion,
}: {
	hasCustomizations: boolean;
	form?: UseUpdateSubscriptionForm;
	numVersions?: number;
	currentVersion?: number;
}) {
	const showVersionSelector =
		form && numVersions !== undefined && numVersions > 1;

	const versionOptions = showVersionSelector
		? Array.from(
				{ length: numVersions },
				(_, index) => numVersions - index,
			).map((version) => ({
				label: `Version ${version}`,
				value: String(version),
			}))
		: [];

	return (
		<span className="flex items-center justify-between w-full gap-2">
			<span className="flex items-center gap-1.5">
				Plan Configuration
				{hasCustomizations && (
					<Tooltip>
						<TooltipTrigger asChild>
							<InfoIcon
								size={14}
								weight="fill"
								className="text-amber-500 cursor-help"
							/>
						</TooltipTrigger>
						<TooltipContent side="top">
							This subscription's configuration was edited. See changes below.
						</TooltipContent>
					</Tooltip>
				)}
			</span>
			{showVersionSelector && (
				<form.AppField name="version">
					{(field) => (
						<Select
							value={String(field.state.value ?? currentVersion)}
							onValueChange={(value) => field.handleChange(Number(value))}
						>
							<SelectTrigger className="w-fit h-7 text-xs whitespace-nowrap">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{versionOptions.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
				</form.AppField>
			)}
		</span>
	);
}

export function EditPlanSection({
	hasCustomizations,
	onEditPlan,
	product,
	customerProduct,
	features,
	form,
	numVersions,
	currentVersion,
}: EditPlanSectionProps) {
	return (
		<SheetSection
			title={
				<SectionTitle
					hasCustomizations={hasCustomizations}
					form={form}
					numVersions={numVersions}
					currentVersion={currentVersion}
				/>
			}
			withSeparator
		>
			{product?.items && product.items.length > 0 && (
				<>
					<div className="flex gap-2 justify-between items-center h-6 mb-3">
						<BasePriceDisplay product={product} readOnly={true} />
					</div>
					<div className="space-y-2 mb-4">
						{product.items.map((item: ProductItem, index: number) => {
							if (!item.feature_id) return null;

							const feature = features?.find((f) => f.id === item.feature_id);
							const prepaidOption = featureToOptions({
								feature,
								options: customerProduct?.options,
							});

							const prepaidQuantity =
								item.usage_model === UsageModel.Prepaid
									? prepaidOption?.quantity
									: null;

							return (
								<PlanFeatureRow
									key={item.feature_id || item.price_id || index}
									item={item}
									index={index}
									readOnly={true}
									prepaidQuantity={prepaidQuantity}
								/>
							);
						})}
					</div>
				</>
			)}
			<Button variant="secondary" onClick={onEditPlan} className="w-full">
				<PencilSimpleIcon size={14} className="mr-1" />
				Edit Plan Items
			</Button>
		</SheetSection>
	);
}
