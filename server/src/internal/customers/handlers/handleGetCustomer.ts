import { CusService } from "@/internal/customers/CusService.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { CusProductStatus, ErrCode } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { getCustomerDetails } from "../cusUtils/getCustomerDetails.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { parseCusExpand } from "../cusUtils/cusUtils.js";
import { FeatureService } from "@/internal/features/FeatureService.js";

export const handleGetCustomer = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "get customer",
    handler: async () => {
      let customerId = req.params.customer_id;
      let { orgId, env, db } = req;
      let { expand } = req.query;

      let expandArray = parseCusExpand(expand);

      const [features, org, customer] = await Promise.all([
        FeatureService.getFromReq(req),
        OrgService.getFromReq(req),
        CusService.getFull({
          db,
          idOrInternalId: customerId,
          orgId: orgId,
          env: env,
          inStatuses: [
            CusProductStatus.Active,
            CusProductStatus.PastDue,
            CusProductStatus.Scheduled,
          ],
          withEntities: true,
          expand: expandArray,
          allowNotFound: true,
        }),
      ]);

      if (!customer) {
        req.logtail.warn(
          `GET /customers/${customerId}: not found | Org: ${req.minOrg.slug}`,
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
