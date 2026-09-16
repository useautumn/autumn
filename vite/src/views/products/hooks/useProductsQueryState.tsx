import { parseAsBoolean, parseAsString, useQueryStates } from "nuqs";

export const useProductsQueryState = () => {
	const [queryStates, setQueryStates] = useQueryStates(
		{
			showArchivedProducts: parseAsBoolean.withDefault(false),
			showArchivedFeatures: parseAsBoolean.withDefault(false),
			feature: parseAsString,
		},
		{
			history: "push",
		},
	);

	return { queryStates, setQueryStates };
};
