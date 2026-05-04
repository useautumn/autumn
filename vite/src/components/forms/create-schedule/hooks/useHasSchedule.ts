import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

export function useHasSchedule() {
	const { schedule, customer } = useCusQuery({ schedule: true });
	return !!schedule || !!customer?.entities?.some((entity) => entity.schedule);
}
