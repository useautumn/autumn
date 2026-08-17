import type { QueryClient } from "@tanstack/react-query";

/**
 * Refresh everything a billing write can change on the customer page: the
 * customer itself, the paginated plans table, schedules, and license pools.
 *
 * Keyed on the root rather than a customer id — callers derive that id
 * inconsistently (`id` vs `internal_id`), and a mismatch silently refreshes
 * nothing instead of failing loudly.
 */
export const invalidateCustomerBillingQueries = ({
	queryClient,
}: {
	queryClient: QueryClient;
}) => {
	queryClient.invalidateQueries({ queryKey: ["customer"] });
	queryClient.invalidateQueries({ queryKey: ["customer-schedule"] });
	queryClient.invalidateQueries({ queryKey: ["full_customers"] });
	queryClient.invalidateQueries({ queryKey: ["license_pools"] });
};
