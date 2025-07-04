import { CusService } from "@/internal/customers/CusService.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { CusProductStatus, ErrCode } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { getCustomerDetails } from "../cusUtils/getCustomerDetails.js";
import { parseCusExpand } from "../cusUtils/cusUtils.js";

export const handleGetCustomer = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "get customer",
    handler: async () => {
      let customerId = req.params.customer_id;
      let { env, db, logtail: logger, org, features } = req;
      let { expand } = req.query;

      let expandArray = parseCusExpand(expand);

      logger.info(`getting customer ${customerId} for org ${org.slug}`);
      const startTime = Date.now();
      const customer = await CusService.getFull({
        db,
        idOrInternalId: customerId,
        orgId: org.id,
        env: env,
        inStatuses: [
          CusProductStatus.Active,
          CusProductStatus.PastDue,
          CusProductStatus.Scheduled,
        ],
        withEntities: true,
        expand: expandArray,
        allowNotFound: true,
      });
      logger.info(`get customer took ${Date.now() - startTime}ms`);

      if (!customer) {
        req.logtail.warn(
          `GET /customers/${customerId}: not found | Org: ${org.slug}`,
        );
        res.status(StatusCodes.NOT_FOUND).json({
          message: `Customer ${customerId} not found`,
          code: ErrCode.CustomerNotFound,
        });
        return;
      }

      let cusData = await getCustomerDetails({
        db,
        customer,
        org,
        env: req.env,
        logger: req.logtail,
        cusProducts: customer.customer_products,
        expand: expandArray,
        features,
        reqApiVersion: req.apiVersion,
      });

      res.status(200).json(cusData);
    },
  });
