"use client";

import { useQuery } from "@tanstack/react-query";
import type { Plan } from "@useautumn/sdk";
import type { ListPlansParams } from "../../types";
import { useAutumnClient } from "../AutumnContext";
import type { AutumnClientError } from "../client/AutumnClientError";
import type { HookParams } from "./types";

export type UseListPlansParams = HookParams<ListPlansParams, Plan[]>;

export const useListPlans = (params: UseListPlansParams = {}) => {
	const client = useAutumnClient({ caller: "useListPlans" });
	const { queryOptions, ...listPlansParams } = params;

	return useQuery<Plan[], AutumnClientError>({
		queryKey: ["autumn", "plans", listPlansParams],
		queryFn: async () => {
			const response = await client.listPlans(listPlansParams);
			return response.list;
		},
		...queryOptions,
	});
};
