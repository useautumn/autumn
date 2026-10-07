import { SearchableSelect } from "@autumn/ui";
import { useState } from "react";
import { useOrgSearch } from "../edge-config/OrgSearchResults";
import { matchesOrgSearch, toRateLimitOrg } from "./rateLimitOrgs";
import type { RateLimitOrg } from "./rateLimitTypes";

/** Orgs with overrides first (with their count), then every org the admin search finds by name, slug or id. */
export const RateLimitOrgCombobox = ({
	value,
	overrideOrgs,
	onChange,
	placeholder,
	triggerClassName,
}: {
	value: RateLimitOrg | null;
	overrideOrgs: RateLimitOrg[];
	onChange: (org: RateLimitOrg) => void;
	placeholder: string;
	triggerClassName?: string;
}) => {
	const [search, setSearch] = useState("");
	const { rows, isSearching } = useOrgSearch({ search });

	const matchingOverrideOrgs = overrideOrgs.filter((org) =>
		matchesOrgSearch({ org, search }),
	);
	const searchedOrgs = rows
		.map((org) => toRateLimitOrg({ org, overrideOrgs }))
		.filter((org) => !matchingOverrideOrgs.includes(org));
	const options = [...matchingOverrideOrgs, ...searchedOrgs];
	if (value && !options.some(({ key }) => key === value.key)) {
		options.unshift(value);
	}

	return (
		<SearchableSelect
			value={value?.key ?? null}
			onValueChange={(key) => {
				const org = options.find((option) => option.key === key);
				if (org) onChange(org);
			}}
			options={options}
			getOptionValue={(org) => org.key}
			getOptionLabel={(org) => org.name}
			renderOption={(org) => (
				<span className="flex min-w-0 flex-1 items-center gap-2">
					<span className="truncate">{org.name}</span>
					{org.slug !== org.name && (
						<span className="truncate font-mono text-tiny text-tertiary-foreground">
							{org.slug}
						</span>
					)}
					{org.overrideCount > 0 && (
						<span className="ml-auto tabular-nums text-tertiary-foreground">
							{org.overrideCount}
						</span>
					)}
				</span>
			)}
			placeholder={placeholder}
			searchable
			searchPlaceholder="Search orgs by name, slug or id"
			onSearchChange={setSearch}
			isLoading={isSearching}
			emptyText="No organizations found."
			triggerClassName={triggerClassName}
		/>
	);
};
