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

export const getSingularAndPlural = ({
  feature,
  capitalize = false,
}: {
  feature: Feature;
  capitalize?: boolean;
}) => {
  return {
    singular: getFeatureName({ feature, plural: false, capitalize }),
    plural: getFeatureName({ feature, plural: true, capitalize }),
  };
};

export const numberWithCommas = (x: number) => {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

export const getFeatureInvoiceDescription = ({
  feature,
  usage,
  billingUnits = 1,
}: {
  feature: Feature;
  usage: number;
  billingUnits?: number;
}) => {
  const { singular, plural } = getSingularAndPlural({ feature });

  const usageStr = numberWithCommas(usage);
  if (billingUnits == 1) {
    if (usage == 1)
      return `${usageStr} ${singular}`; // eg. 1 credit
    else return `${usageStr} ${plural}`; // eg. 4 credits
  } else {
    return `${usageStr} x ${billingUnits} ${plural}`; // eg. 4 x 100 credits
  }
};
