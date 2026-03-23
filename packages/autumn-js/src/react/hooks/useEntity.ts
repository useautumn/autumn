"use client";

import { useQuery } from "@tanstack/react-query";
import type { GetEntityResponse } from "@useautumn/sdk";
import type { GetEntityClientParams } from "../../types";
import { useAutumnClient } from "../AutumnContext";
import type { AutumnClientError } from "../client/AutumnClientError";
import type { HookParams, HookResult } from "./types";

export type UseEntityParams = HookParams<
	GetEntityClientParams,
	GetEntityResponse | null
>;

export type UseEntityResult = HookResult<GetEntityResponse | null>;

/**
 * Fetches an Autumn entity (sub-resource of a customer, eg. a seat or project).
 *
 * @returns Entity data including subscriptions, purchases, and balances.
 */
export const useEntity = (params: UseEntityParams): UseEntityResult => {
	const client = useAutumnClient({ caller: "useEntity" });
	const { queryOptions, ...sdkParams } = params;

	const queryResult = useQuery<GetEntityResponse | null, AutumnClientError>({
		queryKey: ["autumn", "entity", sdkParams],
		queryFn: () => client.getEntity(sdkParams),
		...queryOptions,
	});

	return queryResult as UseEntityResult;
};
