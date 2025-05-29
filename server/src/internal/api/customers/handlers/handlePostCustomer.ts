import { handleRequestError } from "@/utils/errorUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { CusProductStatus, ErrCode } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { getCustomerDetails } from "../getCustomerDetails.js";

import { OrgService } from "@/internal/orgs/OrgService.js";

import { getOrCreateCustomer } from "@/internal/customers/cusUtils/getOrCreateCustomer.js";
import { parseCusExpand } from "../cusUtils.js";
import { FeatureService } from "@/internal/features/FeatureService.js";

export const handlePostCustomerRequest = async (req: any, res: any) => {
  const logger = req.logtail;
  try {
    const { db } = req;
    const data = req.body;
    const expand = parseCusExpand(req.query.expand);

    if (!data.id && !data.email) {
      throw new RecaseError({
        message: "ID or email is required",
        code: ErrCode.InvalidRequest,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    let org = await OrgService.getFromReq(req);
    let features = await FeatureService.getFromReq(req);
    let customer = await getOrCreateCustomer({
      req,
      db,
      org,
      env: req.env,
      customerId: data.id,
      customerData: data,
      logger,
      inStatuses: [
        CusProductStatus.Active,
        CusProductStatus.PastDue,
        CusProductStatus.Scheduled,
      ],
      expand,

      features,
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
