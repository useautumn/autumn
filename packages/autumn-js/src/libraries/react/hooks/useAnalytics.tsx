import type * as operations from "@useautumn/sdk/models/operations";
import useSWR from "swr";
import { AutumnContext, useAutumnContext } from "../AutumnContext";
import type { QueryParams } from "../client/autumnTypes";

export const useAnalytics = (params: QueryParams) => {
	const context = useAutumnContext({
		AutumnContext,
		name: "useAnalytics",
	});

	const client = context.client;

	const fetcher = async () => {
		const data = await client.query(params);

		return data?.list || [];
	};

	const { data, error, mutate } = useSWR<operations.PostQueryResponse["list"]>(
		["analytics", params.featureId, params.range],
		fetcher,
		{ refreshInterval: 0 },
	);

	return {
		data: data,
		isLoading: !error && !data,
		error,
		refetch: mutate,
	};
};
