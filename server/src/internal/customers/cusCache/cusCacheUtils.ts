export const buildBaseCusCacheKey = ({
  idOrInternalId,
  entityId,
  orgId,
  env,
}: {
  idOrInternalId: string;
  entityId?: string;
  orgId: string;
  env: string;
}) => {
  if (entityId) {
    return `customer:${idOrInternalId}_${orgId}_${env}:${entityId}`;
  } else {
    return `customer:${idOrInternalId}_${orgId}_${env}`;
  }
};
