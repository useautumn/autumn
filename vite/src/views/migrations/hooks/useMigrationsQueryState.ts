import { parseAsBoolean, useQueryStates } from "nuqs";

export const useMigrationsQueryState = () => {
	const [queryStates, setQueryStates] = useQueryStates(
		{
			showArchived: parseAsBoolean.withDefault(false),
		},
		{
			history: "push",
		},
	);

	return { queryStates, setQueryStates };
};
