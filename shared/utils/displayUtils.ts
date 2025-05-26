import { Feature } from "../models/featureModels/featureModels.js";

export const getFeatureName = ({
  feature,
  plural,
  capitalize = false,
}: {
  feature?: Feature;
  plural: boolean;
  capitalize?: boolean;
}) => {
  if (!feature) {
    return "";
  }

  let featureName = feature.name || "";

  if (feature.display) {
    if (plural) {
      featureName = feature.display.plural || featureName;
    } else {
      featureName = feature.display.singular || featureName;
    }
  }

  if (capitalize) {
    featureName = featureName.charAt(0).toUpperCase() + featureName.slice(1);
  }

  return featureName;
};

export const getFeatureNameWithCapital = ({
  feature,
}: {
  feature: Feature;
}) => {
  if (feature.name && feature.name.length > 0) {
    return `${feature.name.charAt(0).toUpperCase()}${feature.name.slice(1)}`;
  }

  return feature.name;
};
