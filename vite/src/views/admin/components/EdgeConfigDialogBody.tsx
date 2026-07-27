import { Button, Skeleton } from "@autumn/ui";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { getBackendErr } from "@/utils/genUtils";

/** Renders the load/error/ready states for a config dialog so each dialog only
 *  describes its ready state. */
export function EdgeConfigDialogBody<TConfig>({
	query,
	errorMessage,
	skeleton,
	children,
}: {
	query: UseQueryResult<TConfig>;
	errorMessage: string;
	/** Defaults to a two-row skeleton; pass a custom one for wider layouts. */
	skeleton?: ReactNode;
	children: (config: TConfig) => ReactNode;
}) {
	if (query.isLoading) {
		if (skeleton) return <>{skeleton}</>;

		return (
			<div className="flex flex-col gap-3">
				<Skeleton className="h-20" />
				<Skeleton className="h-16" />
			</div>
		);
	}

	if (query.isError || !query.data) {
		return (
			<div className="flex flex-col items-start gap-3 rounded-lg border border-border p-4">
				<p role="alert" className="text-pretty text-sm text-destructive">
					{getBackendErr(query.error, errorMessage)}
				</p>
				<Button variant="secondary" size="sm" onClick={() => query.refetch()}>
					Retry
				</Button>
			</div>
		);
	}

	return <>{children(query.data)}</>;
}
