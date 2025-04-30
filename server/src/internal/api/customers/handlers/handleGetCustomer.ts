import { CusService } from "@/internal/customers/CusService.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { CusProductStatus, ErrCode } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { getCustomerDetails } from "../getCustomerDetails.js";
import { OrgService } from "@/internal/orgs/OrgService.js";

export const handleGetCustomer = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "get customer",
    handler: async () => {
      let customerId = req.params.customer_id;
      let { orgId, env } = req;
      const start = performance.now();

      const [org, customer] = await Promise.all([
        OrgService.getFromReq(req),
        CusService.getWithProducts({
          sb: req.sb,
          idOrInternalId: customerId,
          orgId: orgId,
          env: env,
          inStatuses: [
            CusProductStatus.Active,
            CusProductStatus.PastDue,
            CusProductStatus.Scheduled,
          ],
        }),
      ]);

      if (!customer) {
        req.logtail.warn(
          `GET /customers/${customerId}: not found | Org: ${req.minOrg.slug}`
        );
        res.status(StatusCodes.NOT_FOUND).json({
          message: `Customer ${customerId} not found`,
          code: ErrCode.CustomerNotFound,
        });
        return;
      }

      let cusData = await getCustomerDetails({
        customer,
        sb: req.sb,
        org,
        env: req.env,
        logger: req.logtail,
        cusProducts: customer.customer_products,
      });

      const end = performance.now();
      console.log(`get customer took ${(end - start).toFixed(2)}ms`);

      res.status(200).json(cusData);
    },
  });
