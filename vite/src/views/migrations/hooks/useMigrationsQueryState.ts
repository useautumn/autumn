import { parseAsBoolean, parseAsInteger, useQueryStates } from "nuqs";
import { DEFAULT_MIGRATION_LIST_PAGE_SIZE } from "@/utils/constants/migrationListPagination";

export const useMigrationsQueryState = () => {
	const [queryStates, setQueryStates] = useQueryStates(
		{
			showArchived: parseAsBoolean.withDefault(false),
			page: parseAsInteger.withDefault(1),
			pageSize: parseAsInteger.withDefault(DEFAULT_MIGRATION_LIST_PAGE_SIZE),
		},
		{
			history: "replace",
		},
	);

	return { queryStates, setQueryStates };
};
