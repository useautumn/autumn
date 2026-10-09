import { SearchableSelect, type SearchableSelectProps } from "@autumn/ui";
import type { ReactNode } from "react";
import { SelectOptionLabel } from "@/views/customers/customer/analytics/components/SelectOptionLabel";

export type FilterOption = { id: string; name: string };

/** Option id standing for "no filter", kept out of the URL. */
export const ALL_OPTION_ID = "__all__";

/** SearchableSelect for the Logs toolbar: one id/name option shape and the shared row. */
export const FilterSelect = ({
	trigger,
	...props
}: { trigger: ReactNode } & Pick<
	SearchableSelectProps<FilterOption>,
	| "value"
	| "options"
	| "onValueChange"
	| "searchable"
	| "searchPlaceholder"
	| "emptyText"
	| "shouldFilter"
	| "onSearchChange"
	| "isLoading"
>) => (
	<SearchableSelect<FilterOption>
		getOptionValue={(option) => option.id}
		getOptionLabel={(option) => option.name}
		renderOption={(option, isSelected) => (
			<SelectOptionLabel name={option.name} isSelected={isSelected} />
		)}
		contentClassName="min-w-[240px] rounded-xl"
		trigger={trigger}
		{...props}
	/>
);
