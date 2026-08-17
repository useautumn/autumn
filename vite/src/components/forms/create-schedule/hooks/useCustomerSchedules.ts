import type { FullCustomerSchedule } from "@autumn/shared";
import { useMemo } from "react";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

/** Every live schedule on the customer, across customer and entity scopes. */
export function useCustomerSchedules(): FullCustomerSchedule[] {
	const { schedules } = useCusQuery({ schedule: true });
	return schedules ?? [];
}

/** Customer product ids controlled by any of the customer's schedules. */
export function useScheduledCustomerProductIds(): Set<string> {
	const schedules = useCustomerSchedules();
	return useMemo(
		() =>
			new Set(
				schedules.flatMap((schedule) =>
					schedule.phases.flatMap((phase) => phase.customer_product_ids),
				),
			),
		[schedules],
	);
}
