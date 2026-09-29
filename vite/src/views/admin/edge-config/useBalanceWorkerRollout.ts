import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import {
	NO_ROLLOUT,
	type RolloutCustomerPin,
	type RolloutEntry,
	type RolloutsResponse,
} from "./rolloutTypes";

const QUERY_KEY = ["admin-rollouts"];

/** Pins still on the worker or on their way off; a landed removal only lingers for cache staleness. */
const toVisibleCustomerPins = ({
	entry,
	settleMs,
	now,
}: {
	entry?: RolloutEntry;
	settleMs: number;
	now: number;
}): RolloutCustomerPin[] =>
	Object.entries(entry?.customers ?? {}).flatMap(([orgId, customers]) =>
		Object.entries(customers)
			.filter(
				([, customer]) =>
					customer.removedAt === undefined ||
					now < customer.removedAt + settleMs,
			)
			.map(([customerId, customer]) => ({ orgId, customerId, customer })),
	);

/** Server state for the balance-worker rollout: the config as S3 holds it, plus the mutations that move it. */
export const useBalanceWorkerRollout = () => {
	const axiosInstance = useAxiosInstance();
	const queryClient = useQueryClient();

	const query = useQuery<RolloutsResponse>({
		queryKey: QUERY_KEY,
		queryFn: async () => {
			const { data } = await axiosInstance.get("/admin/rollouts");
			return data;
		},
	});

	const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });
	const rolloutId = query.data?.activeRolloutId;
	const rolloutPath = `/admin/rollouts/${rolloutId}`;

	const setGlobalPercent = useMutation({
		mutationFn: async ({ percent }: { percent: number }) => {
			await axiosInstance.put(rolloutPath, { percent });
		},
		onSuccess: () => {
			toast.success("Global percent scheduled");
			void refresh();
		},
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to update global percent")),
	});

	const setOrgPercent = useMutation({
		mutationFn: async ({
			orgId,
			percent,
		}: {
			orgId: string;
			percent: number;
		}) => {
			await axiosInstance.put(`${rolloutPath}/orgs/${orgId}`, { percent });
		},
		onSuccess: () => {
			toast.success("Org percent scheduled");
			void refresh();
		},
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to update org percent")),
	});

	const removeOrg = useMutation({
		mutationFn: async ({ orgId }: { orgId: string }) => {
			await axiosInstance.delete(`${rolloutPath}/orgs/${orgId}`);
		},
		onSuccess: () => {
			toast.success("Org override removed");
			void refresh();
		},
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to remove org override")),
	});

	const addCustomers = useMutation({
		mutationFn: async ({
			orgId,
			customerIds,
		}: {
			orgId: string;
			customerIds: string[];
		}) => {
			await axiosInstance.put(`${rolloutPath}/orgs/${orgId}/customers`, {
				customer_ids: customerIds,
			});
		},
		onSuccess: () => {
			toast.success("Customers scheduled onto the worker");
			void refresh();
		},
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to add customers")),
	});

	const removeCustomer = useMutation({
		mutationFn: async ({
			orgId,
			customerId,
		}: {
			orgId: string;
			customerId: string;
		}) => {
			await axiosInstance.delete(`${rolloutPath}/orgs/${orgId}/customers`, {
				data: { customer_ids: [customerId] },
			});
		},
		onSuccess: () => {
			toast.success("Customer scheduled off the worker");
			void refresh();
		},
		onError: (error) =>
			toast.error(getBackendErr(error, "Failed to remove customer")),
	});

	const entry = rolloutId ? query.data?.rollouts[rolloutId] : undefined;
	const settleMs = query.data?.settleMs ?? 0;

	return {
		isLoading: query.isLoading,
		refresh,
		rolloutId,
		settleMs,
		global: entry ?? NO_ROLLOUT,
		orgOverrides: Object.entries(entry?.orgs ?? {}),
		customerPins: toVisibleCustomerPins({
			entry,
			settleMs,
			now: query.dataUpdatedAt,
		}),
		orgsById: query.data?.orgsById ?? {},
		customerNamesByOrgId: query.data?.customerNamesByOrgId ?? {},
		health: query.data
			? {
					healthy: query.data.configHealthy,
					lastSuccessAt: query.data.lastSuccessAt,
				}
			: undefined,
		setGlobalPercent,
		setOrgPercent,
		removeOrg,
		addCustomers,
		removeCustomer,
	};
};
