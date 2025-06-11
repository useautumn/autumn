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

    if (!data.id && !data.email) {
      throw new RecaseError({
        message: "ID or email is required",
        code: ErrCode.InvalidRequest,
        statusCode: StatusCodes.BAD_REQUEST,
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
      logger.warn(
        `POST /customers: ${error.message} (org: ${req.minOrg.slug})`,
      );
      res.status(error.statusCode).json({
        message: error.message,
        code: error.code,
      });
      return;
    }
    handleRequestError({ req, error, res, action: "create customer" });
  }
};
