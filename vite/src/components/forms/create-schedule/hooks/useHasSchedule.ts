import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

export function useHasSchedule({
	entityId,
}: { entityId?: string | null } = {}) {
	const { schedule, customer } = useCusQuery({ schedule: true });
	if (entityId) {
		const entity = customer?.entities?.find(
			(e) => e.id === entityId || e.internal_id === entityId,
		);
		return !!entity?.schedule;
	}
	return !!schedule;
}
