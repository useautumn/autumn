import { SearchableSelect } from "@autumn/ui";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useImpersonateOrg } from "../hooks/useImpersonateOrg";

/** Admin-only org picker: choosing an org impersonates a member and reloads in place. */
export const ImpersonateOrgSelect = ({
	currentOrg,
	className,
}: {
	currentOrg: { id: string; name: string } | undefined;
	className?: string;
}) => {
	const { orgs, isSearching, setSearch, impersonate, isImpersonating } =
		useImpersonateOrg();

	return (
		<SearchableSelect
			value={currentOrg?.id ?? null}
			onValueChange={impersonate}
			options={orgs}
			getOptionValue={(org) => org.id}
			getOptionLabel={(org) => org.name}
			renderOption={(org) => (
				<span className="flex flex-col min-w-0">
					<span className="truncate">{org.name}</span>
					<span className="text-xs text-tertiary-foreground truncate">
						{org.slug}
					</span>
				</span>
			)}
			renderValue={() => (
				<span className="flex items-center gap-2 min-w-0">
					<ShieldCheck className="size-4 shrink-0 text-primary" />
					<span className="truncate">
						{currentOrg?.name ?? "Select an organization"}
					</span>
				</span>
			)}
			searchable
			searchPlaceholder="Search orgs to impersonate…"
			emptyText="No organizations found"
			onSearchChange={setSearch}
			isLoading={isSearching}
			disabled={isImpersonating}
			triggerClassName={cn("w-[200px]", className)}
		/>
	);
};
