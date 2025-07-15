import { Feature } from "@autumn/shared";

export const getAllEventNames = ({ features }: { features: Feature[] }) => {
  return features.flatMap((feature: Feature) => {
    const eventNames =
      feature.config.filters && feature.config.filters.length > 0
        ? feature.config.filters[0].value
        : [];

    return eventNames.filter(
      (name: string) =>
        !features.some(
          (f: Feature) =>
            f.id == name && f.config.usage_type == "continuous_use",
        ),
    );
  });
};
