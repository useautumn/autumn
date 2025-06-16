export interface FeatureCheckPreviewParams {
  customerId: string;
  featureId: string;
  quantity: number;
}

export const getFeatureCheckPreview = async ({
  customerId,
  featureId,
  quantity,
}: FeatureCheckPreviewParams) => {};
