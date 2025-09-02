import { useGeneralQuery } from "@/hooks/queries/useGeneralQuery";

export const useSavedViewsQuery = () => {
  return useGeneralQuery({
    url: "/saved_views",
    queryKey: ["saved_views"],
  });
};
