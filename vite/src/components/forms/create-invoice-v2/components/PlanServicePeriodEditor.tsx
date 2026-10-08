import {
	BillingMethod,
	findFeatureById,
	getFeatureNameWithCapital,
	type ProductItem,
} from "@autumn/shared";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";
import { useState } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import type {
	FormInvoicePlan,
	ServicePeriod,
} from "../createInvoiceFormSchema";
import {
	formatServicePeriod,
	listServicePeriodTargets,
	type ServicePeriodTarget,
	servicePeriodForTarget,
} from "../utils/servicePeriod";
import { ServicePeriodPicker } from "./ServicePeriodPicker";

const ALL = "all";
const BASE = "base";
const featureValue = (featureId: string) => `feature:${featureId}`;

const BEHAVIOR_LABELS: Record<BillingMethod, string> = {
	[BillingMethod.Prepaid]: "Prepaid",
	[BillingMethod.UsageBased]: "Usage-based",
};

/** Which of the plan's prices the dates apply to, then the dates themselves. */
export function PlanServicePeriodEditor({
	plan,
	items,
	onApply,
}: {
	plan: FormInvoicePlan;
	items: ProductItem[] | null;
	onApply: (params: {
		target: ServicePeriodTarget;
		period: ServicePeriod | null;
	}) => void;
}) {
	const { features } = useFeaturesQuery();
	const options = listServicePeriodTargets({ items });
	const featureOptions = options.flatMap((option) =>
		option.kind === "feature" ? [option] : [],
	);
	const itemOverrideCount = Object.keys(plan.featurePeriods).length;

	const [targetValue, setTargetValue] = useState(
		itemOverrideCount > 0 ? BASE : ALL,
	);
	const featureOption = featureOptions.find(
		({ featureId }) => featureValue(featureId) === targetValue,
	);
	const [behavior, setBehavior] = useState<BillingMethod>(
		featureOption?.behaviors[0] ?? BillingMethod.Prepaid,
	);

	const target: ServicePeriodTarget = featureOption
		? {
				kind: "feature",
				featureId: featureOption.featureId,
				behavior: featureOption.behaviors.includes(behavior)
					? behavior
					: (featureOption.behaviors[0] ?? BillingMethod.UsageBased),
			}
		: { kind: targetValue === BASE ? "base" : "all" };

	const featureName = (featureId: string) => {
		const feature = findFeatureById({ features, featureId });
		return feature ? getFeatureNameWithCapital({ feature }) : featureId;
	};
	const periodLabel = (option: ServicePeriodTarget) => {
		const period = servicePeriodForTarget({ plan, target: option });
		return period ? formatServicePeriod(period, { compact: true }) : null;
	};
	const featurePeriodLabel = (option: (typeof featureOptions)[number]) =>
		option.behaviors
			.map((optionBehavior) =>
				periodLabel({
					kind: "feature",
					featureId: option.featureId,
					behavior: optionBehavior,
				}),
			)
			.filter(Boolean)
			.join(", ");

	const selectItems = [
		{ value: ALL, label: "All prices", period: periodLabel({ kind: "all" }) },
		{ value: BASE, label: "Base price", period: periodLabel({ kind: "base" }) },
		...featureOptions.map((option) => ({
			value: featureValue(option.featureId),
			label: featureName(option.featureId),
			period: featurePeriodLabel(option) || null,
		})),
	];
	const selected = selectItems.find(({ value }) => value === targetValue);

	const hint =
		target.kind === "all" && itemOverrideCount > 0
			? `Replaces ${itemOverrideCount} item ${itemOverrideCount === 1 ? "period" : "periods"} on this plan.`
			: target.kind === "base"
				? "Items without their own period use these dates."
				: null;

	return (
		<div className="flex w-72 flex-col gap-3">
			<p className="text-sm font-medium text-foreground">Service period</p>
			<div className="flex gap-2">
				<Select
					items={selectItems}
					value={targetValue}
					onValueChange={(value) => value && setTargetValue(value)}
				>
					<SelectTrigger className="min-w-0 flex-1">
						<SelectValue>{selected?.label}</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{selectItems.map((item) => (
							<SelectItem key={item.value} value={item.value}>
								<span className="flex w-full items-center gap-2">
									<span className="truncate">{item.label}</span>
									{item.period && (
										<span className="ml-auto shrink-0 text-xs text-tertiary-foreground tabular-nums">
											{item.period}
										</span>
									)}
								</span>
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{featureOption && featureOption.behaviors.length > 1 && (
					<Select
						items={featureOption.behaviors.map((value) => ({
							value,
							label: BEHAVIOR_LABELS[value],
						}))}
						value={target.kind === "feature" ? target.behavior : behavior}
						onValueChange={(value) =>
							value && setBehavior(value as BillingMethod)
						}
					>
						<SelectTrigger className="w-32 shrink-0">
							<SelectValue>
								{target.kind === "feature" && BEHAVIOR_LABELS[target.behavior]}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{featureOption.behaviors.map((value) => (
								<SelectItem key={value} value={value}>
									{BEHAVIOR_LABELS[value]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			</div>
			{hint && <p className="text-xs text-tertiary-foreground">{hint}</p>}
			<ServicePeriodPicker
				key={JSON.stringify(target)}
				showTitle={false}
				value={servicePeriodForTarget({ plan, target })}
				onApply={(period) => onApply({ target, period })}
			/>
		</div>
	);
}
