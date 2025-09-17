import { parseAsBoolean, parseAsString, useQueryStates } from "nuqs";

export const useOnboardingQueryState = () => {
  const [queryStates, setQueryStates] = useQueryStates(
    {
      page: parseAsString.withDefault("pricing"),
      reactTypescript: parseAsBoolean.withDefault(true),
      frontend: parseAsString.withDefault(""),
      backend: parseAsString.withDefault(""),
      auth: parseAsString.withDefault(""),
      customerType: parseAsString.withDefault("user"),
      productId: parseAsString.withDefault(""),
      token: parseAsString.withDefault(""),
    },
    {
      history: "push",
    }
  );

  return { queryStates, setQueryStates };
};
