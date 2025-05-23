import { updateCustomerDetails } from "@/internal/api/customers/cusUtils.js";
import { handleCreateCustomer } from "@/internal/api/customers/handlers/handleCreateCustomer.js";
import { SupabaseClient } from "@supabase/supabase-js";
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

import { createEntities } from "@/internal/api/entities/handleCreateEntity.js";
import RecaseError from "@/utils/errorUtils.js";
import { StatusCodes } from "http-status-codes";

export const getOrCreateCustomer = async ({
  sb,
  org,
  features,
  customerId,
  customerData,
  env,
  logger,
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
  sb: SupabaseClient;
  org: Organization;
  features: Feature[];
  env: AppEnv;
  customerId: string;
  customerData?: CustomerData;
  logger: any;
  inStatuses?: CusProductStatus[];
  skipGet?: boolean;
  withEntities?: boolean;
  expand?: CusExpand[];
  entityId?: string;
  entityData?: EntityData;
}): Promise<FullCustomer> => {
  let customer;

  if (!skipGet) {
    customer = await CusService.getWithProducts({
      sb,
      idOrInternalId: customerId,
      orgId: org.id,
      env,
      inStatuses,
      withEntities,
      entityId,
      expand,
    });
  }

  if (!customer) {
    logger.info(`no customer found, creating new`, { customerData });
    try {
      customer = await handleCreateCustomer({
        cusData: {
          id: customerId,
          name: customerData?.name,
          email: customerData?.email,
          fingerprint: customerData?.fingerprint,
          metadata: customerData?.metadata || {},
        },
        sb,
        org,
        env,
        logger,
        getDetails: false,
      });

      customer = await CusService.getWithProducts({
        sb,
        idOrInternalId: customerId || customer.internal_id,
        orgId: org.id,
        env,
        inStatuses,
        withEntities,
        entityId,
        expand,
      });
    } catch (error: any) {
      if (error?.data?.code == "23505") {
        customer = await CusService.getWithProducts({
          sb,
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
    sb,
    customer,
    customerData,
    logger,
  });

  if (entityId && !customer.entity) {
    logger.info(`Auto creating entity ${entityId} for customer ${customerId}`);

    let newEntities = await createEntities({
      sb,
      org,
      customerId,
      createEntityData: {
        id: entityId,
        name: entityData?.name,
        feature_id: entityData?.feature_id,
      },
      features,
      env,
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
