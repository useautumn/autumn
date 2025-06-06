import { updateCustomerDetails } from "./cusUtils.js";
import { handleCreateCustomer } from "../handlers/handleCreateCustomer.js";

import { CusService } from "../CusService.js";
import {
  AppEnv,
  CusExpand,
  CusProductStatus,
  CustomerData,
  EntityData,
  ErrCode,
  Feature,
  FullCustomer,
  Organization,
} from "@autumn/shared";

import { createEntities } from "@/internal/entities/handlers/handleCreateEntity/handleCreateEntity.js";
import RecaseError from "@/utils/errorUtils.js";
import { StatusCodes } from "http-status-codes";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { ExtendedRequest } from "@/utils/models/Request.js";

export const getOrCreateCustomer = async ({
  req,
  customerId,
  customerData,
  inStatuses = [
    CusProductStatus.Active,
    CusProductStatus.PastDue,
    CusProductStatus.Scheduled,
  ],
  skipGet = false,
  withEntities = false,
  expand,

  // Entity stuff
  entityId,
  entityData,
}: {
  req: ExtendedRequest;
  customerId: string;
  customerData?: CustomerData;
  inStatuses?: CusProductStatus[];
  skipGet?: boolean;
  withEntities?: boolean;
  expand?: CusExpand[];
  entityId?: string;
  entityData?: EntityData;
}): Promise<FullCustomer> => {
  let customer;

  const { db, org, features, env, logtail: logger } = req;

  if (!skipGet) {
    customer = await CusService.getFull({
      db,
      idOrInternalId: customerId,
      orgId: org.id,
      env,
      inStatuses,
      withEntities,
      entityId,
      expand,
      allowNotFound: true,
    });
  }

  if (!customer) {
    try {
      customer = await handleCreateCustomer({
        req,
        db,
        cusData: {
          id: customerId,
          name: customerData?.name,
          email: customerData?.email,
          fingerprint: customerData?.fingerprint,
          metadata: customerData?.metadata || {},
        },
        org,
        env,
        logger,
      });

      customer = await CusService.getFull({
        db,
        idOrInternalId: customerId || customer!.internal_id,
        orgId: org.id,
        env,
        inStatuses,
        withEntities,
        entityId,
        expand,
      });
    } catch (error: any) {
      if (error?.data?.code == "23505") {
        customer = await CusService.getFull({
          db,
          idOrInternalId: customerId,
          orgId: org.id,
          env,
          inStatuses,
          withEntities,
          entityId,
          expand,
        });
      } else {
        throw error;
      }
    }
  }

  customer = await updateCustomerDetails({
    db,
    customer,
    customerData,
    logger,
  });

  if (entityId && !customer.entity) {
    logger.info(`Auto creating entity ${entityId} for customer ${customerId}`);

    let newEntities = await createEntities({
      req,
      customerId,
      createEntityData: {
        id: entityId,
        name: entityData?.name,
        feature_id: entityData?.feature_id,
      },
      logger,
      fromAutoCreate: true,
    });

    customer.entities = [...(customer.entities || []), ...newEntities];
    customer.entity = newEntities.length > 0 ? newEntities[0] : null;

    if (customer.entity === null) {
      throw new RecaseError({
        message: `Entity ${entityId} not found for customer ${customerId}. This entity must be created first as it has a price associated with it.`,
        code: ErrCode.EntityNotFound,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }
  }

  return customer as FullCustomer;
};
