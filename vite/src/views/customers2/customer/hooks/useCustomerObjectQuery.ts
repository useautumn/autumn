import { LATEST_VERSION } from "@autumn/shared";
import { useQuery } from "@tanstack/react-query";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

const CUSTOMER_EXPAND_PARAMS = [
	"invoices",
	"trials_used",
	"rewards",
	"entities",
	"referrals",
	"payment_method",
	"billing_controls.auto_topups.purchase_limit",
].join(",");

const ENTITY_EXPAND_PARAMS = "invoices";

const CUSTOMER_OBJECT_GC_TIME = 5 * 60 * 1000;

const buildUrl = (customerId: string, scopeEntityId?: string | null) =>
	scopeEntityId
		? `/v1/customers/${customerId}/entities/${scopeEntityId}?expand=${ENTITY_EXPAND_PARAMS}`
		: `/v1/customers/${customerId}?expand=${CUSTOMER_EXPAND_PARAMS}`;

export function useCustomerObjectQuery({
	customerId,
	scopeEntityId,
	enabled,
	staleTime = CUSTOMER_OBJECT_GC_TIME,
}: {
	customerId?: string;
	scopeEntityId?: string | null;
	enabled: boolean;
	staleTime?: number;
}) {
	const axiosInstance = useAxiosInstance({ version: LATEST_VERSION });
	const buildKey = useQueryKeyFactory();

	return useQuery({
		queryKey: buildKey(["customer-object", customerId, scopeEntityId]),
		queryFn: async () => {
			const { data } = await axiosInstance.get(
				buildUrl(customerId as string, scopeEntityId),
			);
			return data;
		},
		enabled: enabled && !!customerId,
		gcTime: CUSTOMER_OBJECT_GC_TIME,
		staleTime,
	});
}
