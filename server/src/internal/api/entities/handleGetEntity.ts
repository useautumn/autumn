import { routeHandler } from "@/utils/routerUtils.js";
import { EntityService } from "./EntityService.js";
import { CusService } from "@/internal/customers/CusService.js";
import {
  CusProductStatus,
  CustomerEntitlementSchema,
  EntityExpand,
  EntityResponseSchema,
  ErrCode,
  FullCusProduct,
  InvoiceResponse,
} from "@autumn/shared";
import {
  getCusFeaturesResponse,
  getCusProductsResponse,
} from "@/internal/customers/cusUtils/cusResponseUtils.js";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import Stripe from "stripe";
import RecaseError from "@/utils/errorUtils.js";
import { parseEntityExpand } from "./entityUtils.js";
import { getCusInvoices } from "../customers/cusUtils.js";
import { getEntityResponse } from "./getEntityUtils.js";
import { getInvoicesForResponse } from "@/internal/customers/invoices/invoiceUtils.js";

export const handleGetEntity = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "getEntity",
    handler: async (req, res) => {
      const entityId = req.params.entity_id as string;
      const customerId = req.params.customer_id as string;
      const expand = parseEntityExpand(req.query.expand);

      let { orgId, env, sb, logtail: logger } = req;

      let org = await OrgService.getFromReq(req);

      let { entities, customer, fullEntities } = await getEntityResponse({
        sb,
        entityIds: [entityId],
        org,
        env,
        customerId,
      });

      let entity = entities[0];

      let withInvoices = expand.includes(EntityExpand.Invoices);
      let invoices: InvoiceResponse[] | undefined;

      if (withInvoices) {
        invoices = await getInvoicesForResponse({
          sb,
          internalCustomerId: customer.internal_id,
          internalEntityId: fullEntities[0].internal_id,
        });
      }

      res.status(200).json(
        EntityResponseSchema.parse({
          ...entity,
          invoices: withInvoices ? invoices : undefined,
        })
      );
    },
  });
