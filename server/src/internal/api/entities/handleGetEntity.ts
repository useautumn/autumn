import { routeHandler } from "@/utils/routerUtils.js";
import { EntityService } from "./EntityService.js";
import { CusService } from "@/internal/customers/CusService.js";
import {
  CusProductStatus,
  CustomerEntitlementSchema,
  Entity,
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

      const start = performance.now();
      let { entities, customer, fullEntities } = await getEntityResponse({
        sb,
        entityIds: [entityId],
        org,
        env,
        customerId,
      });
      const end = performance.now();
      logger.info(`getEntityResponse took ${(end - start).toFixed(2)}ms`);

      let entity = entities[0];
      let fullEntity = fullEntities.find(
        (e: Entity) => e.id == entityId
      ) as Entity;

      let withInvoices = expand.includes(EntityExpand.Invoices);
      let invoices: InvoiceResponse[] | undefined;

      if (withInvoices) {
        const invoiceStart = performance.now();
        invoices = await getInvoicesForResponse({
          sb,
          internalCustomerId: customer.internal_id,
          internalEntityId: fullEntity.internal_id,
        });
        const invoiceEnd = performance.now();
        logger.info(
          `getInvoicesForResponse took ${(invoiceEnd - invoiceStart).toFixed(
            2
          )}ms`
        );
      }

      res.status(200).json(
        EntityResponseSchema.parse({
          ...entity,
          invoices: withInvoices ? invoices : undefined,
        })
      );
    },
  });
