import { updateCustomerDetails } from "@/internal/api/customers/cusUtils.js";
import { handleCreateCustomer } from "@/internal/api/customers/handlers/handleCreateCustomer.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { AppEnv, CustomerData } from "autumn-js";
import { CusService } from "../CusService.js";
import { CusProductStatus, FullCustomer } from "@autumn/shared";
export const getOrCreateCustomer = async ({
  sb,
  orgId,
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
}: {
  sb: SupabaseClient;
  orgId: string;
  env: AppEnv;
  customerId: string;
  customerData?: CustomerData;
  logger: any;
  inStatuses?: CusProductStatus[];
  skipGet?: boolean;
}): Promise<FullCustomer> => {
  let customer;

  if (!skipGet) {
    customer = await CusService.getWithProducts({
      sb,
      idOrInternalId: customerId,
      orgId,
      env,
      inStatuses,
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
        orgId,
        env,
        logger,
        orgSlug: "",
        getDetails: false,
      });

      customer = await CusService.getWithProducts({
        sb,
        idOrInternalId: customerId,
        orgId,
        env,
        inStatuses,
      });
    } catch (error: any) {
      if (error?.data?.code == "23505") {
        customer = await CusService.getWithProducts({
          sb,
          idOrInternalId: customerId,
          orgId,
          env,
          inStatuses,
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

  return customer as FullCustomer;
};
