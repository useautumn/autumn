import type { UseQueryOptions, UseQueryResult } from "@tanstack/react-query";
import type { AutumnClientError } from "../client/AutumnClientError";

export type HookParams<
	T extends object,
	TData = unknown,
	TError = AutumnClientError,
> = T & {
	queryOptions?: Omit<UseQueryOptions<TData, TError>, "queryKey" | "queryFn">;
};

export type HookResult<TData, TError = AutumnClientError> = Omit<
	UseQueryResult<TData, TError>,
	"data"
> & {
	data: TData | undefined;
};

export type HookResultWithMethods<
	TData,
	TMethods extends object,
	TError = AutumnClientError,
> = HookResult<TData, TError> & TMethods;
