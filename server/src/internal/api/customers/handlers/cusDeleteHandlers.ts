import { deleteStripeCustomer } from "@/external/stripe/stripeCusUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import RecaseError from "@/utils/errorUtils.js";
import { AppEnv, ErrCode, MinOrg, Organization } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import chalk from "chalk";
import { StatusCodes } from "http-status-codes";

export const deleteCusById = async ({
  sb,
  org,
  customerId,
  env,
  logger,
  deleteInStripe = false,
}: {
  sb: SupabaseClient;
  org: Organization;
  customerId: string;
  env: AppEnv;
  logger: any;
  deleteInStripe?: boolean;
}) => {
  console.log(
    `${chalk.yellow("deleteCusById")}: ${customerId}, ${org.id}, ${env}`
  );
  const orgId = org.id;

  const customer = await CusService.getByIdOrInternalId({
    sb,
    idOrInternalId: customerId,
    orgId,
    env,
  });

  if (!customer) {
    throw new RecaseError({
      message: `Customer ${customerId} not found`,
      code: ErrCode.CustomerNotFound,
      statusCode: StatusCodes.NOT_FOUND,
    });
  }

  if (deleteInStripe) {
    try {
      // Only delete stripe customer in sandbox
      if (customer.processor?.id && env === AppEnv.Sandbox) {
        await deleteStripeCustomer({
          org,
          env: env,
          stripeId: customer.processor.id,
        });
      }
    } catch (error: any) {
      console.log(
        `Couldn't delete ${chalk.yellow("stripe customer")} ${
          customer.processor.id
        }`,
        error?.message || error
      );
    }
  }

  await CusService.deleteByInternalId({
    sb: sb,
    internalId: customer.internal_id,
    orgId,
    env: env,
  });

  return {
    success: true,
    customer,
  };
};
