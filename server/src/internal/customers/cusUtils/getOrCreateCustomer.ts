import { updateCustomerDetails } from "@/internal/api/customers/cusUtils.js";
import { handleCreateCustomer } from "@/internal/api/customers/handlers/handleCreateCustomer.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { CusService } from "../CusService.js";
import {
  AppEnv,
  CusExpand,
  CusProductStatus,
  CustomerData,
  ErrCode,
  FullCustomer,
  Organization,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import RecaseError from "@/utils/errorUtils.js";

export const getOrCreateCustomer = async ({
  sb,
  org,
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
  entityId,
  expand,
}: {
  sb: SupabaseClient;
  org: Organization;
  env: AppEnv;
  customerId: string;
  customerData?: CustomerData;
  logger: any;
  inStatuses?: CusProductStatus[];
  skipGet?: boolean;
  withEntities?: boolean;
  entityId?: string;
  expand?: CusExpand[];
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
        },
        sb,
        org,
        env,
        logger,
        getDetails: false,
      });

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
    throw new RecaseError({
      message: `Entity ${entityId} not found for customer ${customerId}`,
      code: ErrCode.EntityNotFound,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }
  return customer as FullCustomer;
};
