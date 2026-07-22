import type { Entity } from "@autumn/shared";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { useCustomerContext } from "../CustomerContext";

/** Closes the open sheet and scopes the customer page to the given entity. */
export function useGoToEntity() {
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const { customer } = useCustomerContext();
	const { setEntityId } = useEntity();

	return (entityId: string) => {
		const entity = customer.entities?.find(
			(candidate: Entity) => candidate.id === entityId,
		);
		if (!entity) return;
		closeSheet();
		setEntityId(entity.internal_id);
	};
}
