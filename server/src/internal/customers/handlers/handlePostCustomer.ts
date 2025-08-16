import { handleRequestError } from "@/utils/errorUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { CusProductStatus, ErrCode } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { getCustomerDetails } from "../cusUtils/getCustomerDetails.js";

import { getOrCreateCustomer } from "../cusUtils/getOrCreateCustomer.js";
import { parseCusExpand } from "../cusUtils/cusUtils.js";

export const handlePostCustomerRequest = async (req: any, res: any) => {
  const logger = req.logtail;
  try {
    const data = req.body;

    const expand = parseCusExpand(req.query.expand);
    const { db, org, features } = req;

    if (data.customer_id) {
      throw new RecaseError({
        message:
          "use the `id` field instead of `customer_id` to specify the new customer's ID",
        code: ErrCode.InvalidInputs,
      });
    }

    if (data.id === undefined) {
      throw new RecaseError({
        message: "`id` field must be either a string or null",
        code: ErrCode.InvalidInputs,
      });
    }

    if (!data.id && !data.email) {
      throw new RecaseError({
        message: "ID or email is required",
        code: ErrCode.InvalidRequest,
      });
    }

    let customer = await getOrCreateCustomer({
      req,
      customerId: data.id,
      customerData: data,
      inStatuses: [
        CusProductStatus.Active,
        CusProductStatus.PastDue,
        CusProductStatus.Scheduled,
      ],
      expand,

      entityId: data.entity_id,
      entityData: data.entity_data,
      withCache: true,
    });

    let cusDetails = await getCustomerDetails({
      db,
      customer,
      org,
      env: req.env,
      params: req.query,
      logger,
      cusProducts: customer.customer_products,
      expand,
      features,
      reqApiVersion: req.apiVersion,
    });

    res.status(200).json(cusDetails);
  } catch (error: any) {
    if (
      error instanceof RecaseError &&
      error.code === ErrCode.DuplicateCustomerId
    ) {
      logger.warn(`POST /customers: ${error.message} (org: ${req.org?.slug})`);
      res.status(error.statusCode).json({
        message: error.message,
        code: error.code,
      });
      return;
    }
    handleRequestError({ req, error, res, action: "create customer" });
  }
};
