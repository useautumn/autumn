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
import {
  deleteCusCache,
  refreshCusCache,
} from "../cusCache/updateCachedCus.js";
import { getCusWithCache } from "../cusCache/getCusWithCache.js";

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
  withCache = false,
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
  withCache?: boolean;
}): Promise<FullCustomer> => {
  let customer;

  const { db, org, features, env, logtail: logger } = req;

  if (!withEntities) {
    withEntities = expand?.includes(CusExpand.Entities) || false;
  }

  if (!skipGet) {
    if (withCache) {
      customer = await getCusWithCache({
        db,
        idOrInternalId: customerId,
        org,
        env,
        entityId,
        expand: expand as CusExpand[],
        logger,
      });
    } else {
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
          stripe_id: customerData?.stripe_id,
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

      await deleteCusCache({
        db,
        customerId: customer.id!,
        org,
        env,
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
    org,
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

    await refreshCusCache({
      db,
      customerId: customer.id!,
      org,
      env: customer.env,
    });
  }

  return customer as FullCustomer;
};
