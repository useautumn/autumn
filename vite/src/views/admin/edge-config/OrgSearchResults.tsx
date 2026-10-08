import { cn } from "@autumn/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/useDebounce";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import type { RolloutOrg } from "./rolloutTypes";

type OrgSearchResponse = { rows: RolloutOrg[]; hasNextPage: boolean };

export const useOrgSearch = ({ search }: { search: string }) => {
	const axiosInstance = useAxiosInstance();
	const debounced = useDebounce({ value: search.trim(), delayMs: 250 });
	const query = useQuery<OrgSearchResponse>({
		queryKey: ["admin-rollout-org-search", debounced],
		queryFn: async () => {
			const { data } = await axiosInstance.get(
				`/admin/orgs?search=${encodeURIComponent(debounced)}`,
			);
			return data;
		},
		enabled: debounced.length > 0,
	});
	return {
		rows: query.data?.rows ?? [],
		isSearching: query.isLoading,
		hasQuery: debounced.length > 0,
	};
};

/** Admin org search by name, id or slug; the picked org is highlighted. */
export const OrgSearchResults = ({
	search,
	selectedOrgId,
	onSelect,
}: {
	search: string;
	selectedOrgId: string;
	onSelect: (org: RolloutOrg) => void;
}) => {
	const { rows, isSearching, hasQuery } = useOrgSearch({ search });
	const message = !hasQuery
		? "Type to search by name, id or slug."
		: isSearching
			? "Searching…"
			: rows.length === 0
				? "No organizations found."
				: null;

	return (
		<div className="max-h-40 overflow-y-auto rounded-lg border bg-background p-1">
			{message ? (
				<div className="flex h-20 items-center justify-center px-4 text-center text-sm text-tertiary-foreground">
					{message}
				</div>
			) : (
				rows.map((org) => (
					<button
						type="button"
						key={org.id}
						onClick={() => onSelect(org)}
						className={cn(
							"flex w-full flex-col rounded-md px-3 py-2 text-left transition-colors",
							selectedOrgId === org.id ? "bg-primary/10" : "hover:bg-muted/60",
						)}
					>
						<span className="text-sm font-medium text-foreground">
							{org.name || org.id}
						</span>
						<span className="font-mono text-[11px] text-tertiary-foreground">
							{org.slug ? `${org.slug} · ${org.id}` : org.id}
						</span>
					</button>
				))
			)}
		</div>
	);
};
