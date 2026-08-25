import {
	type CreditSchemaItem,
	type Feature,
	getFeatureName,
	isAiCreditSystem,
} from "@autumn/shared";
import { GroupedTabButton, IconButton } from "@autumn/ui";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { X } from "lucide-react";
import {
	isGraduated,
	rateTypeOf,
	setRateType,
} from "../utils/creditSchemaUtils";
import { CreditNumberInput } from "./CreditNumberInput";
import { CreditTierRows } from "./CreditTierRows";
import { FeatureSelectDropdown } from "./FeatureSelectDropdown";

const RATE_TYPE_OPTIONS = [
	{ value: "flat", label: "Flat" },
	{ value: "graduated", label: "Tiered" },
];

interface CreditRateCardRowProps {
	item: CreditSchemaItem;
	availableFeatures: Feature[];
	allFeatures: Feature[];
	onChange: (item: CreditSchemaItem) => void;
	onRemove: () => void;
}

export function CreditRateCardRow({
	item,
	availableFeatures,
	allFeatures,
	onChange,
	onRemove,
}: CreditRateCardRowProps) {
	const selectedFeature = allFeatures.find(
		(f: Feature) => f.id === item.metered_feature_id,
	);
	const billingUnits = item.feature_amount ?? 1;
	const isAiChild = isAiCreditSystem(selectedFeature?.type);
	const unitName = isAiChild
		? "of AI usage"
		: getFeatureName({
				feature: selectedFeature,
				plural: billingUnits !== 1,
				capitalize: false,
			}) || "units";

	return (
		<div className="flex flex-col gap-2 rounded-lg border p-3">
			<div className="flex items-center gap-2">
				<div className="flex-1 min-w-0">
					<FeatureSelectDropdown
						value={item.metered_feature_id}
						onValueChange={(metered_feature_id) =>
							onChange({ ...item, metered_feature_id })
						}
						availableFeatures={availableFeatures}
						allFeatures={allFeatures}
					/>
				</div>
				<IconButton
					aria-label="Remove rate card item"
					type="button"
					variant="skeleton"
					iconOrientation="center"
					icon={<X />}
					onClick={onRemove}
				/>
			</div>

			<div className="flex items-center gap-2">
				<span className="text-tertiary-foreground text-xs shrink-0 w-14">
					per
				</span>
				{isAiChild && (
					<span className="text-tertiary-foreground text-xs">$</span>
				)}
				<CreditNumberInput
					ariaLabel="Billing units"
					className="w-26 shrink-0"
					placeholder="eg. 100"
					value={item.feature_amount}
					onValueChange={(feature_amount) =>
						onChange({ ...item, feature_amount })
					}
				/>
				<span className="text-tertiary-foreground text-xs truncate">
					{unitName}
				</span>
				<GroupedTabButton
					className="ml-auto shrink-0"
					value={rateTypeOf(item)}
					onValueChange={(rateType) =>
						onChange(
							setRateType({ item, rateType: rateType as "flat" | "graduated" }),
						)
					}
					options={RATE_TYPE_OPTIONS}
				/>
			</div>

			{isGraduated(item) ? (
				<>
					<CreditTierRows item={item} onChange={onChange} />
					<div className="flex items-center gap-1.5 text-amber-500 text-xs">
						<WarningCircleIcon size={12} />
						Tiered rating is not live yet — tracking usage for this feature will
						be rejected.
					</div>
				</>
			) : (
				<div className="flex items-center gap-2">
					<span className="text-tertiary-foreground text-xs shrink-0 w-14">
						costs
					</span>
					<CreditNumberInput
						ariaLabel="Credit cost"
						className="w-26 shrink-0"
						placeholder="eg. 1"
						value={item.credit_amount}
						onValueChange={(credit_amount) =>
							onChange({ ...item, credit_amount })
						}
					/>
					<span className="text-tertiary-foreground text-xs">credits</span>
				</div>
			)}
		</div>
	);
}
