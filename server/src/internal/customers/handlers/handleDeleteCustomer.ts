import chalk from "chalk";
import RecaseError from "@/utils/errorUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { deleteStripeCustomer } from "@/external/stripe/stripeCusUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { ExtendedRequest, ExtendedResponse } from "@/utils/models/Request.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { AppEnv, ErrCode, Organization } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";

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

  let response = {
    customer,
    success: true,
  };

  try {
    if (customer.processor?.id && deleteInStripe) {
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

    response.success = false;
  }

  await CusService.deleteByInternalId({
    db,
    internalId: customer.internal_id,
    orgId,
    env: env,
  });

  return response;
};

export const handleDeleteCustomer = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "delete customer",
    handler: async (req: ExtendedRequest, res: ExtendedResponse) => {
      const { env, logtail: logger, db, org } = req;
      const { delete_in_stripe } = req.query;

      const data = await deleteCusById({
        db,
        org,
        customerId: req.params.customer_id,
        env,
        logger,
        deleteInStripe: delete_in_stripe === "true",
      });

      res.status(200).json(data);
    },
  });
