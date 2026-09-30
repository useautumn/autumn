import { cn } from "@autumn/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import type { RolloutCustomerOption } from "./rolloutTypes";

type CustomerSearchResponse = { rows: RolloutCustomerOption[] };

const useCustomerSearch = ({
	orgId,
	search,
}: {
	orgId: string;
	search: string;
}) => {
	const axiosInstance = useAxiosInstance();
	const debounced = useDebounce({ value: search.trim(), delayMs: 250 });
	const query = useQuery<CustomerSearchResponse>({
		queryKey: ["admin-rollout-customer-search", orgId, debounced],
		queryFn: async () => {
			const { data } = await axiosInstance.get(
				`/admin/orgs/${orgId}/customers?search=${encodeURIComponent(debounced)}`,
			);
			return data;
		},
		enabled: debounced.length > 0,
	});
	return {
		term: debounced,
		rows: query.data?.rows ?? [],
		isSearching: query.isLoading,
	};
};

/** Search results plus the raw term, so a customer that does not exist yet can still be pinned by id. */
const withTypedId = ({
	term,
	rows,
}: {
	term: string;
	rows: RolloutCustomerOption[];
}): RolloutCustomerOption[] =>
	rows.some(({ id }) => id === term)
		? rows
		: [{ id: term, name: null, email: null }, ...rows];

const searchMessage = ({
	term,
	isSearching,
}: {
	term: string;
	isSearching: boolean;
}) => {
	if (!term) return "Type to search by name, id or email.";
	if (isSearching) return "Searching…";
	return null;
};

/** Customers of the picked org matching the search; clicking one toggles it in the selection. */
export const CustomerSearchResults = ({
	orgId,
	search,
	selectedIds,
	onToggle,
}: {
	orgId: string;
	search: string;
	selectedIds: string[];
	onToggle: (customer: RolloutCustomerOption) => void;
}) => {
	const { term, rows, isSearching } = useCustomerSearch({ orgId, search });
	const message = searchMessage({ term, isSearching });

	return (
		<div className="max-h-48 overflow-y-auto rounded-lg border bg-background p-1">
			{message ? (
				<div className="flex h-20 items-center justify-center px-4 text-center text-xs text-tertiary-foreground">
					{message}
				</div>
			) : (
				withTypedId({ term, rows }).map((customer) => {
					const selected = selectedIds.includes(customer.id);
					const isTypedId = !rows.includes(customer);
					return (
						<button
							type="button"
							key={customer.id}
							onClick={() => onToggle(customer)}
							className={cn(
								"flex w-full items-center justify-between gap-3 rounded-md px-3 py-1.5 text-left transition-colors",
								selected ? "bg-primary/10" : "hover:bg-muted/60",
							)}
						>
							<span className="flex min-w-0 flex-col">
								<span className="truncate text-sm text-foreground">
									{isTypedId
										? `Use "${customer.id}" as a customer ID`
										: (customer.name ?? customer.id)}
								</span>
								{!isTypedId && (
									<span className="truncate font-mono text-[11px] text-tertiary-foreground">
										{customer.email
											? `${customer.id} · ${customer.email}`
											: customer.id}
									</span>
								)}
							</span>
							{selected && <Check className="size-3.5 shrink-0 text-primary" />}
						</button>
					);
				})
			)}
		</div>
	);
};
