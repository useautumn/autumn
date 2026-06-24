import type { Feature, ProductItem } from "@autumn/shared";
import { BillingInterval, EntInterval, UsageModel } from "@autumn/shared";
import {
	BoxArrowDownIcon,
	CaretDownIcon,
	MoneyWavyIcon,
	WalletIcon,
} from "@phosphor-icons/react";
import type React from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@autumn/ui";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";

const LABEL_OVERRIDES: Record<string, string> = {
	[BillingInterval.SemiAnnual]: "Semi-annual",
	[BillingInterval.OneOff]: "One-off",
};

const billingSet = new Set<string>(Object.values(BillingInterval));
const allIntervals = [
	...Object.values(BillingInterval),
	...Object.values(EntInterval).filter((v) => !billingSet.has(v)),
];

export const INTERVAL_OPTIONS: { value: string; label: string }[] =
	allIntervals.map((v) => ({
		value: v,
		label: LABEL_OVERRIDES[v] ?? keyToTitle(v),
	}));

export const CLEAR_VALUE = "__clear__";

const BILLING_METHOD_OPTIONS: {
	value: string;
	label: string;
	icon: React.ReactNode;
	color: string;
}[] = [
	{
		value: "included",
		label: "Included",
		icon: <BoxArrowDownIcon size={16} weight="duotone" />,
		color: "text-green-500",
	},
	{
		value: "usage_based",
		label: "Usage-based",
		icon: <MoneyWavyIcon size={16} weight="duotone" />,
		color: "text-yellow-500",
	},
	{
		value: "prepaid",
		label: "Prepaid",
		icon: <WalletIcon size={16} weight="duotone" />,
		color: "text-orange-500",
	},
];

export function BillingMethodDropdown({
	value,
	onChange,
}: {
	value: string | null;
	onChange: (value: string | undefined) => void;
}) {
	const selected = BILLING_METHOD_OPTIONS.find((o) => o.value === value);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="flex items-center justify-between w-full rounded-lg border bg-transparent text-sm outline-none h-input input-base input-shadow-default input-state-open p-2"
				>
					{selected ? (
						<div className="flex items-center gap-2">
							<span className={selected.color}>{selected.icon}</span>
							<span className="truncate">{selected.label}</span>
						</div>
					) : (
						<span className="truncate text-muted-foreground">Any method</span>
					)}
					<CaretDownIcon className="size-4 opacity-50" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-(--anchor-width) p-1">
				{selected && (
					<DropdownMenuItem
						onClick={() => onChange(undefined)}
						className="py-1.5 px-2 text-muted-foreground"
					>
						Any method
					</DropdownMenuItem>
				)}
				{BILLING_METHOD_OPTIONS.map((o) => (
					<DropdownMenuItem
						key={o.value}
						onClick={() =>
							onChange(o.value === "included" ? undefined : o.value)
						}
						className="py-1.5 px-2"
					>
						<span className={o.color}>{o.icon}</span>
						<span className="truncate flex-1">{o.label}</span>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export interface ItemFilter {
	feature_id?: string;
	interval?: string;
	billing_method?: string;
}

export function filterToProductItem(filter: ItemFilter): ProductItem {
	return {
		feature_id: filter.feature_id,
		interval: filter.interval,
		usage_model:
			filter.billing_method === "prepaid"
				? UsageModel.Prepaid
				: filter.billing_method === "usage_based"
					? UsageModel.PayPerUse
					: undefined,
		tiers:
			filter.billing_method === "usage_based"
				? [{ to: "inf", amount: 0 }]
				: undefined,
	} as ProductItem;
}

export function getFilterSummary(
	filter: ItemFilter,
	features: Feature[],
): string {
	const feature = features.find((f) => f.id === filter.feature_id);
	const name = feature?.name || filter.feature_id || "Unconfigured";
	const parts: string[] = [name];
	if (filter.interval) parts.push(filter.interval);
	return parts.join(" · ");
}
