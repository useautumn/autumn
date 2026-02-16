import type * as operations from "@useautumn/sdk/models/operations";
import useSWR from "swr";
import { AutumnContext, useAutumnContext } from "../AutumnContext";

export const usePaywall = ({
	featureId,
	entityId,
}: {
	featureId?: string;
	entityId?: string;
}) => {
	const context = useAutumnContext({
		AutumnContext,
		name: "usePaywall",
	});

	const enabled = !!featureId && !!context;

	const fetcher = async () => {
		if (!featureId) {
			return { preview: undefined };
		}

		return await context.client.check({
			featureId,
			withPreview: true,
		});
	};

	const queryKey = [`check`, featureId, entityId];

	const { data, error, isLoading } = useSWR(queryKey, fetcher, {
		refreshInterval: 0,
		enabled,
	});

	return {
		data: data?.preview as operations.Preview | undefined,
		error,
		isLoading,
	};
};
