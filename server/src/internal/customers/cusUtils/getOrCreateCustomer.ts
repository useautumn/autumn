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

import { ExtendedRequest } from "@/utils/models/Request.js";
import { autoCreateEntity } from "@/internal/entities/handlers/handleCreateEntity/autoCreateEntity.js";

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

  if (!withEntities) {
    withEntities = expand?.includes(CusExpand.Entities) || false;
  }

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
      withSubs: true,
    });
  }

  if (!customer) {
    try {
      customer = await handleCreateCustomer({
        req,
        cusData: {
          id: customerId,
          name: customerData?.name,
          email: customerData?.email,
          fingerprint: customerData?.fingerprint,
          metadata: customerData?.metadata || {},
        },
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
        withSubs: true,
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
          withSubs: true,
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

    let newEntity = await autoCreateEntity({
      req,
      customer,
      entityId,
      entityData: {
        id: entityId,
        name: entityData?.name,
        feature_id: entityData?.feature_id!,
      },
      logger,
    });

    customer.entities = [...(customer.entities || []), newEntity];
    customer.entity = newEntity;
  }

  return customer as FullCustomer;
};
