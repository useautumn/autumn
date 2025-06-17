import { getOrCreateCustomer } from "@/internal/customers/cusUtils/getOrCreateCustomer.js";
import RecaseError from "@/utils/errorUtils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { CreateEntity, CustomerData, Entity, ErrCode } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

export const validateAndGetInputEntities = async ({
  req,
  customerId,
  customerData,
  createEntityData,
  logger,
}: {
  req: ExtendedRequest;
  customerId: string;
  customerData?: CustomerData;
  createEntityData: CreateEntity[] | CreateEntity;
  logger: any;
}) => {
  const { features } = req;

  // 1. Get customer
  let customer = await getOrCreateCustomer({
    req,
    customerId,
    customerData,
    withEntities: true,
  });

  if (!customer) {
    throw new RecaseError({
      message: `Customer ${customerId} not found`,
      code: ErrCode.CustomerNotFound,
    });
  }

  // 2. Get input entities
  let inputEntities: any[] = [];
  if (Array.isArray(createEntityData)) {
    inputEntities = createEntityData;
  } else {
    inputEntities = [createEntityData];
  }

  for (const entity of inputEntities) {
    let feature = features.find((f: any) => f.id === entity.feature_id);
    if (!feature) {
      throw new RecaseError({
        message: `Feature ${entity.feature_id} not found`,
        code: ErrCode.FeatureNotFound,
      });
    }
  }

  let cusProducts = customer.customer_products;
  let existingEntities = customer.entities;

  let noIdEntities = existingEntities.filter((e: Entity) => !e.id);
  let noIdNewEntities = inputEntities.filter((e: CreateEntity) => !e.id);

  if (noIdEntities.length + noIdNewEntities.length > 1) {
    throw new RecaseError({
      message: "Can only have one entity with no ID",
      code: ErrCode.EntityIdRequired,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  for (const entity of existingEntities) {
    if (inputEntities.some((e: any) => e.id === entity.id) && !entity.deleted) {
      throw new RecaseError({
        message: `Entity ${entity.id} already exists`,
        code: "ENTITY_ALREADY_EXISTS",
        data: {
          entity,
        },
        statusCode: StatusCodes.CONFLICT,
      });
    }
  }

  return {
    customer,
    features,
    inputEntities,
    // feature_id,
    // feature,
    cusProducts,
    existingEntities,
  };
};
