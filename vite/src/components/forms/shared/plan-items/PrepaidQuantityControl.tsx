import { roundUsageToNearestBillingUnit } from "@autumn/shared";
import { type ReactNode, useState } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { QuantityEditControl } from "./QuantityEditControl";

export function PrepaidQuantityControl({
	quantity,
	billingUnits = 1,
	readOnly = false,
	children,
}: {
	quantity: number | undefined;
	billingUnits?: number | null;
	readOnly?: boolean;
	children: ReactNode;
}) {
	const [isEditing, setIsEditing] = useState(false);
	const step = billingUnits > 0 ? billingUnits : 1;
	const roundedQuantity = roundUsageToNearestBillingUnit({
		usage: quantity ?? 0,
		billingUnits: step,
	});
	const showRing = useDebounce({
		value: quantity !== undefined && step > 1 && roundedQuantity !== quantity,
		delayMs: 200,
	});

	return (
		<QuantityEditControl
			readOnly={readOnly}
			displayText={quantity !== undefined ? `x${quantity}` : undefined}
			showRing={showRing}
			isEditing={isEditing}
			onEditingChange={setIsEditing}
		>
			{children}
		</QuantityEditControl>
	);
}
