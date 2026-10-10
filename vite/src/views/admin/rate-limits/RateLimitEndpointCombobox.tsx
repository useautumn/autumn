import { SearchableSelect } from "@autumn/ui";
import { useState } from "react";
import { RateLimitEndpointLabel } from "./RateLimitEndpointLabel";
import { toEndpointKey } from "./rateLimitEndpoints";

/** The API's endpoints to pick from; a typed `METHOD /v1/path` the list lacks is offered as-is. */
export const RateLimitEndpointCombobox = ({
	value,
	endpoints,
	onChange,
	triggerClassName,
}: {
	value: string | null;
	endpoints: string[];
	onChange: (endpoint: string) => void;
	triggerClassName?: string;
}) => {
	const [search, setSearch] = useState("");

	const term = search.trim().toLowerCase();
	const matching = endpoints.filter((endpoint) =>
		endpoint.toLowerCase().includes(term),
	);
	const typed = toEndpointKey(search);
	const options =
		typed && !endpoints.includes(typed) ? [typed, ...matching] : matching;
	if (value && !options.includes(value)) options.unshift(value);

	return (
		<SearchableSelect
			value={value}
			onValueChange={onChange}
			options={options}
			getOptionValue={(endpoint) => endpoint}
			getOptionLabel={(endpoint) => endpoint}
			renderOption={(endpoint) => (
				<span className="flex min-w-0 flex-1 items-center gap-2">
					<RateLimitEndpointLabel endpoint={endpoint} />
					{!endpoints.includes(endpoint) && (
						<span className="ml-auto shrink-0 text-tertiary-foreground">
							custom
						</span>
					)}
				</span>
			)}
			renderValue={(endpoint) =>
				endpoint ? (
					<RateLimitEndpointLabel endpoint={endpoint} />
				) : (
					<span className="text-tertiary-foreground">Pick an endpoint</span>
				)
			}
			placeholder="Pick an endpoint"
			searchable
			searchPlaceholder="Search, or type e.g. POST /v1/entities.delete"
			onSearchChange={setSearch}
			emptyText="No endpoint matches. Type METHOD /v1/path."
			triggerClassName={triggerClassName}
		/>
	);
};
