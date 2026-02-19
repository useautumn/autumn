"use client";

import { useQuery } from "@tanstack/react-query";
import type { Plan } from "@useautumn/sdk";
import { useAutumnClient } from "../AutumnContext";
import type { AutumnClientError } from "../client/AutumnClientError";
import type { HookParams } from "./types";

export type UseListPlansParams = HookParams<Record<string, never>, Plan[]>;

export const useListPlans = (params: UseListPlansParams = {}) => {
	const client = useAutumnClient();
	const { queryOptions } = params;

	return useQuery<Plan[], AutumnClientError>({
		queryKey: ["autumn", "plans"],
		queryFn: async () => {
			const response = await client.listPlans();
			return response.list;
		},
		...queryOptions,
	});
};
