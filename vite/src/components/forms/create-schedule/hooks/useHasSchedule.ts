import { useCustomerSchedules } from "./useCustomerSchedules";

/**
 * Schedules span scopes, so "has a schedule" is a customer-wide question — the
 * sheet opens every schedule the customer has, whatever scope each plan sits in.
 */
export function useHasSchedule() {
	return useCustomerSchedules().length > 0;
}
