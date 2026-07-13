import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

type SyncAnchorsResponse = {
	updated: number;
	skipped: number;
};

export const useSyncCustomerEntitlementAnchors = () => {
	const axiosInstance = useAxiosInstance();
	const { customer, refetch } = useCusQuery();
	const queryClient = useQueryClient();
	const buildQueryKey = useQueryKeyFactory();
	const customerId = customer?.id || customer?.internal_id;

	return useMutation({
		mutationFn: async ({
			customerEntitlementIds,
		}: {
			customerEntitlementIds: string[];
		}) => {
			const { data } = await axiosInstance.post<SyncAnchorsResponse>(
				"/admin/customer-entitlements/sync-anchor",
				{ customer_entitlement_ids: customerEntitlementIds },
			);
			return data;
		},
		onSuccess: async ({ updated, skipped }) => {
			if (updated > 0) {
				toast.success(
					`Synced ${updated} entitlement anchor${updated === 1 ? "" : "s"}`,
				);
			} else {
				toast.info("No entitlement anchors to sync");
			}
			if (skipped > 0 && updated > 0) {
				toast.info(
					`Skipped ${skipped} unsupported entitlement${skipped === 1 ? "" : "s"}`,
				);
			}

			await Promise.all([
				refetch(),
				queryClient.invalidateQueries({
					queryKey: buildQueryKey(["customer", customerId]),
				}),
			]);
		},
		onError: (error) => {
			toast.error(getBackendErr(error, "Failed to sync entitlement anchors"));
		},
	});
};
