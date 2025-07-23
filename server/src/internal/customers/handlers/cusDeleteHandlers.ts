import chalk from "chalk";
import RecaseError from "@/utils/errorUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { deleteStripeCustomer } from "@/external/stripe/stripeCusUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { AppEnv, ErrCode, Organization } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { refreshCusCache } from "../cusCache/updateCachedCus.js";

export const deleteCusById = async ({
  db,
  org,
  customerId,
  env,
  logger,
  deleteInStripe = false,
}: {
  db: DrizzleCli;
  org: Organization;
  customerId: string;
  env: AppEnv;
  logger: any;
  deleteInStripe?: boolean;
}) => {
  const orgId = org.id;

  const customer = await CusService.get({
    db,
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
    db,
    internalId: customer.internal_id,
    orgId,
    env: env,
  });

  return {
    success: true,
    customer,
  };
};

export const handleDeleteCustomer = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "delete customer",
    handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
      const { env, logtail: logger, db, org } = req;

      const data = await deleteCusById({
        db,
        org,
        customerId: req.params.customer_id,
        env,
        logger,
        deleteInStripe: req.query.delete_in_stripe === "true",
      });

      await refreshCusCache({
        customerId: req.params.customer_id,
        orgId: org.id,
        env,
      });

      res.status(200).json(data);
    },
  });
