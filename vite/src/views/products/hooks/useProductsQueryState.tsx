import { parseAsBoolean, useQueryStates } from "nuqs";

export const useProductsQueryState = () => {
  const [queryStates, setQueryStates] = useQueryStates(
    {
      showArchivedProducts: parseAsBoolean.withDefault(false),
      showArchivedFeatures: parseAsBoolean.withDefault(false),
    },
    {
      history: "push",
    }
  );

  return { queryStates, setQueryStates };
};
