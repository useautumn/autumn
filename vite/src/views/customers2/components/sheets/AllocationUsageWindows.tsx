import { ArrowsClockwiseIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { cn } from "@/lib/utils";
import { useAxiosInstance } from "@/services/useAxiosInstance";

type AllocationEntityState = {
	entity_id: string;
	name: string | null;
	requested: number | null;
	granted: number | null;
	usage_cache: number;
	usage_db: number;
	can_draw: number;
	blocked: boolean;
};

type AllocationFeatureState = {
	feature_id: string;
	window: { start: number; end: number };
	scale: { stored: number; effective: number };
	shared: {
		remaining: number;
		requested_total: number;
		claimed_cache: number;
		claimed_db: number;
		unallocated: number;
	};
	entities: AllocationEntityState[];
};

export const allocationStateQueryKey = (customerId?: string) => [
	"allocation-state",
	customerId,
];

const fmt = (value: number | null) =>
	value === null ? "—" : value.toLocaleString();

const fmtDate = (ms: number) =>
	new Date(ms).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});

const Counter = ({ cache, db }: { cache: number; db: number }) => (
	<span className={cn("tabular-nums", cache !== db && "text-amber-600")}>
		{fmt(cache)}
		{cache !== db && (
			<span className="text-tertiary-foreground"> (db {fmt(db)})</span>
		)}
	</span>
);

/** Admin-only view of the allocation counters and each entity's gate, for QA. */
export function AllocationUsageWindows({
	customerId,
	featureId,
}: {
	customerId?: string;
	featureId?: string;
}) {
	const axiosInstance = useAxiosInstance();
	const { data, isFetching, refetch, error } = useQuery({
		queryKey: allocationStateQueryKey(customerId),
		queryFn: async () =>
			(
				await axiosInstance.get<{ features: AllocationFeatureState[] }>(
					`/customers/${customerId}/allocation_state`,
				)
			).data,
		enabled: Boolean(customerId),
	});
	const state = data?.features.find((f) => f.feature_id === featureId);

	return (
		<SheetSection withSeparator>
			<div className="flex flex-col gap-2 text-xs">
				<div className="flex items-center justify-between">
					<span className="font-medium text-sm">Usage windows (admin)</span>
					<button
						type="button"
						onClick={() => refetch()}
						className="text-tertiary-foreground hover:text-foreground"
						aria-label="Refresh usage windows"
					>
						<ArrowsClockwiseIcon
							size={12}
							className={cn(isFetching && "animate-spin")}
						/>
					</button>
				</div>
				{error && (
					<p className="text-destructive">Couldn't load usage windows.</p>
				)}
				{!error && !state && !isFetching && (
					<p className="text-tertiary-foreground">
						No allocation counters yet for this feature.
					</p>
				)}
				{state && (
					<>
						<div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-tertiary-foreground">
							<span>
								Window {fmtDate(state.window.start)} →{" "}
								{fmtDate(state.window.end)}
							</span>
							<span>
								Scale {state.scale.effective.toFixed(4)}
								{state.scale.stored !== state.scale.effective &&
									` (stored ${state.scale.stored.toFixed(4)})`}
							</span>
							<span>
								Pot left {fmt(state.shared.remaining)} · requested{" "}
								{fmt(state.shared.requested_total)}
							</span>
							<span>
								Claimed{" "}
								<Counter
									cache={state.shared.claimed_cache}
									db={state.shared.claimed_db}
								/>{" "}
								· unallocated {fmt(state.shared.unallocated)}
							</span>
						</div>
						<table className="w-full">
							<thead className="text-tertiary-foreground">
								<tr className="text-left">
									<th className="font-normal py-1">Entity</th>
									<th className="font-normal text-right">Requested</th>
									<th className="font-normal text-right">Granted</th>
									<th className="font-normal text-right">Used</th>
									<th className="font-normal text-right">Can draw</th>
									<th className="font-normal text-right">Status</th>
								</tr>
							</thead>
							<tbody>
								{state.entities.map((entity) => (
									<tr key={entity.entity_id} className="border-t">
										<td className="py-1 truncate max-w-32">
											{entity.name || entity.entity_id}
										</td>
										<td className="text-right tabular-nums">
											{fmt(entity.requested)}
										</td>
										<td className="text-right tabular-nums">
											{fmt(entity.granted)}
										</td>
										<td className="text-right">
											<Counter
												cache={entity.usage_cache}
												db={entity.usage_db}
											/>
										</td>
										<td className="text-right tabular-nums">
											{fmt(entity.can_draw)}
										</td>
										<td
											className={cn(
												"text-right",
												entity.blocked ? "text-destructive" : "text-green-600",
											)}
										>
											{entity.blocked ? "Blocked" : "OK"}
										</td>
									</tr>
								))}
							</tbody>
						</table>
						<p className="text-tertiary-foreground">
							Can draw = own unused share + unallocated, before the entity's own
							overage. Amber = live counter differs from Postgres.
						</p>
					</>
				)}
			</div>
		</SheetSection>
	);
}
