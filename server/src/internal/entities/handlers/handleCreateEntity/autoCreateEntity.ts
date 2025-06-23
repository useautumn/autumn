import RecaseError from "@/utils/errorUtils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { ErrCode, FullCustomer } from "@autumn/shared";
import { CreateEntity } from "@autumn/shared";
import { createEntityForCusProduct } from "./createEntityForCusProduct.js";
import { EntityService } from "@/internal/api/entities/EntityService.js";
import { constructEntity } from "../../entityUtils/entityUtils.js";

export const autoCreateEntity = async ({
  req,
  logger,
  customer,
  entityId,
  entityData,
}: {
  req: ExtendedRequest;
  logger: any;
  entityId: string;
  customer: FullCustomer;
  entityData?: CreateEntity;
}) => {
  // Validate CreatEntity
  if (!entityData || !entityData.feature_id) {
    throw new RecaseError({
      message:
        "Failed to auto-create entity, no `feature_id` provided. Please pass in `feature_id` into the `entity_data` field of the request body",
      code: ErrCode.InvalidInputs,
    });
  }

  const { features, db } = req;

  const feature = features.find((f) => f.id === entityData.feature_id);

  if (!feature) {
    throw new RecaseError({
      message: `Feature ${entityData.feature_id} not found`,
      code: ErrCode.InvalidInputs,
    });
  }

  const inputEntity = {
    id: entityId,
    name: entityData.name,
    feature_id: entityData.feature_id,
  };

  for (const cusProduct of customer.customer_products) {
    await createEntityForCusProduct({
      req,
      customer,
      cusProduct,
      inputEntities: [inputEntity],
      fromAutoCreate: true,
      logger,
    });
  }

  let replaceEntity = await EntityService.getNull({
    db,
    orgId: customer.org_id,
    env: customer.env,
    internalCustomerId: customer.internal_id,
    internalFeatureId: feature.internal_id,
  });

  if (replaceEntity) {
    return await EntityService.update({
      db,
      internalId: replaceEntity.internal_id!,
      update: {
        id: entityId,
        name: entityData.name,
      },
    });
  } else {
    return await EntityService.insert({
      db,
      data: [
        constructEntity({
          inputEntity,
          feature,
          internalCustomerId: customer.internal_id,
          orgId: customer.org_id,
          env: customer.env,
        }),
      ],
    });
  }
};
