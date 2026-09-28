import {
	type Feature,
	findFeatureById,
	getFeatureName,
	roundUsageToNearestBillingUnit,
} from "@autumn/shared";
import { type ReactNode, useState } from "react";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { useDebounce } from "@/hooks/useDebounce";
import {
	QuantityEditControl,
	type QuantityTrigger,
} from "./QuantityEditControl";

const quantityDisplayText = ({
	trigger,
	quantity,
	feature,
}: {
	trigger: QuantityTrigger;
	quantity: number | undefined;
	feature: Feature | undefined;
}) => {
	if (trigger === "chip") {
		const units = quantity ?? 0;
		return `${units} ${getFeatureName({ feature, units })}`.trim();
	}
	return quantity !== undefined ? `x${quantity}` : undefined;
};

export function PrepaidQuantityControl({
	quantity,
	billingUnits = 1,
	featureId,
	readOnly = false,
	trigger = "button",
	children,
}: {
	quantity: number | undefined;
	billingUnits?: number | null;
	featureId?: string;
	readOnly?: boolean;
	trigger?: QuantityTrigger;
	children: ReactNode;
}) {
	const [isEditing, setIsEditing] = useState(false);
	const { features } = useFeaturesQuery();
	const step = billingUnits && billingUnits > 0 ? billingUnits : 1;
	const roundedQuantity = roundUsageToNearestBillingUnit({
		usage: quantity ?? 0,
		billingUnits: step,
	});
	const isMisaligned =
		quantity !== undefined && step > 1 && roundedQuantity !== quantity;
	const showRing = useDebounce({ value: isMisaligned, delayMs: 200 });

	const feature = featureId
		? findFeatureById({ features, featureId })
		: undefined;

	const unitsHint = step > 1 ? `Sold in units of ${step}` : undefined;
	const hint = isMisaligned
		? `Billed as ${roundedQuantity} (sold in units of ${step})`
		: unitsHint;

	const displayText = quantityDisplayText({ trigger, quantity, feature });

	return (
		<QuantityEditControl
			displayText={displayText}
			hint={hint}
			isEditing={isEditing}
			onEditingChange={setIsEditing}
			readOnly={readOnly}
			showRing={showRing}
			title={feature?.name ?? featureId}
			trigger={trigger}
		>
			{children}
		</QuantityEditControl>
	);
}
