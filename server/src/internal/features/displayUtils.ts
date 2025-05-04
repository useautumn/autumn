import { Feature } from "@autumn/shared";

import { Organization } from "@autumn/shared";

export const getFeatureName = ({
  feature,
  plural,
}: {
  feature: Feature;
  plural: boolean;
}) => {
  let featureName = feature.name;
  if (!feature.display) {
    return featureName;
  }

  if (plural) {
    return feature.display.plural || featureName;
  }

  return feature.display.singular || featureName;
};

export const getFeatureNameWithCapital = ({
  feature,
}: {
  feature: Feature;
}) => {
  if (feature.name.length > 0) {
    return `${feature.name.charAt(0).toUpperCase()}${feature.name.slice(1)}`;
  }

  return feature.name;
};
