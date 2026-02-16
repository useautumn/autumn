import type { Customer, CustomerExpand } from "@useautumn/sdk/models";
import useSWR, { type SWRConfiguration } from "swr";
import { useAutumnContext } from "../AutumnContext";
import type { ConvexAutumnClient } from "../client/ConvexAutumnClient";
import type { AutumnClient } from "../client/ReactAutumnClient";
import { useAutumnBase } from "./helpers/useAutumnBase";

export interface UseCustomerResult {
	customer: Customer | null;
	isLoading: boolean;
	error: Error | null;
	attach: ReturnType<typeof useAutumnBase>["attach"];
	track: ReturnType<typeof useAutumnBase>["track"];
	cancel: ReturnType<typeof useAutumnBase>["cancel"];
	setupPayment: ReturnType<typeof useAutumnBase>["setupPayment"];
	openBillingPortal: ReturnType<typeof useAutumnBase>["openBillingPortal"];
	checkout: ReturnType<typeof useAutumnBase>["checkout"];
	refetch: () => Promise<Customer | null>;
	// createEntity: (params: EntityCreateParams) => Promise<Entity>;
	// check: (params: CheckParams) => CheckResponse;
}

export interface UseCustomerParams {
	errorOnNotFound?: boolean;
	expand?: CustomerExpand[];
	swrConfig?: SWRConfiguration;
	client?: AutumnClient | ConvexAutumnClient;
}

export const useCustomer = (params?: UseCustomerParams): UseCustomerResult => {
	const context = params?.client
		? undefined
		: useAutumnContext({
				name: "useCustomer",
			});

	const client = params?.client ?? context!.client;
	const queryKey = ["customer", client?.backendUrl || "", params?.expand];

	const fetchCustomer = async () => {
		const result = await client.customers.getOrCreate({
			errorOnNotFound: params?.errorOnNotFound,
			expand: params?.expand,
		});

		return result;
	};

	const {
		data: customer,
		error,
		isLoading,
		mutate,
	} = useSWR(queryKey, fetchCustomer, {
		fallbackData: null,
		shouldRetryOnError: false,
		refreshInterval: 0,
		...params?.swrConfig,
	});

	const autumnFunctions = useAutumnBase({
		context,
		client,
		refetchCustomer: mutate,
	});

	return {
		customer: error ? null : customer,
		isLoading,
		error,
		refetch: mutate as () => Promise<Customer | null>,
		...autumnFunctions,
		// createEntity: client.entities.create,
		// check: (checkParams: CheckParams) => {
		// 	const result = handleCheck({
		// 		customer,
		// 		params: checkParams,
		// 		isEntity: false,
		// 		context,
		// 	});

		// 	if (context) {
		// 		openDialog({
		// 			result,
		// 			params: checkParams,
		// 			context,
		// 		});
		// 	}

		// 	return result;
		// },
	};
};
