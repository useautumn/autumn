import { routeHandler } from "@/utils/routerUtils.js";
import { EntityService } from "./EntityService.js";
import { CusService } from "@/internal/customers/CusService.js";
import {
  CusProductStatus,
  CustomerEntitlementSchema,
  EntityResponseSchema,
  ErrCode,
  FullCusProduct,
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

export const handleGetEntity = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "getEntity",
    handler: async (req, res) => {
      const entityId = req.params.entity_id as string;
      const customerId = req.params.customer_id as string;

      let { orgId, env, sb, logtail: logger } = req;

      let customer = await CusService.getWithProducts({
        idOrInternalId: customerId,
        orgId,
        env,
        sb,
        inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
        entityId,
        withEntities: true,
      });

      if (!customer.entity) {
        throw new RecaseError({
          message: `Entity ${entityId} not found for customer ${customerId}`,
          code: ErrCode.EntityNotFound,
          statusCode: 400,
        });
      }

      let org = await OrgService.getFromReq(req);

      let cusProducts = customer.customer_products.filter(
        (p: FullCusProduct) =>
          p.internal_entity_id == customer.entity.internal_id
      );

      let stripeCli = createStripeCli({
        org,
        env,
      });

      let subs = (await getStripeSubs({
        stripeCli,
        subIds: cusProducts.flatMap(
          (p: FullCusProduct) => p.subscription_ids || []
        ),
      })) as Stripe.Subscription[];

      let products = await getCusProductsResponse({
        cusProducts,
        subs,
        org,
      });

      let features = await getCusFeaturesResponse({
        cusProducts,
        org,
        entities: customer.entities,
      });

      let entity = customer.entity;
      res.status(200).json(
        EntityResponseSchema.parse({
          id: entity.id,
          name: entity.name,
          customer_id: customerId,
          created_at: entity.created_at,
          env,
          products,
          features,
        })
      );
    },
  });
