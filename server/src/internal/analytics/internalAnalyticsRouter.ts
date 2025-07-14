import { Router } from "express";
import { CusService } from "../customers/CusService.js";
import { AnalyticsService } from "./AnalyticsService.js";
import { StatusCodes } from "http-status-codes";
import { ErrCode, FullCusProduct } from "@autumn/shared";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";

export const analyticsRouter = Router();

analyticsRouter.post("/events/", async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "query events by customer id",
    handler: async () => {
      const { db, org, env, features } = req;
      const { interval, event_names, customer_id } = req.body;

      if (!customer_id) {
        throw new RecaseError({
          message: "Customer ID is required",
          code: ErrCode.InvalidRequest,
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }

      let customer = await CusService.getFull({
        db,
        idOrInternalId: customer_id,
        orgId: org.id,
        env,
      });

      if (!customer) {
        throw new RecaseError({
          message: "Customer not found",
          code: ErrCode.CustomerNotFound,
          statusCode: StatusCodes.NOT_FOUND,
        });
      }

      let bcExclusionFlag = false;

      customer.customer_products.forEach((product: FullCusProduct) => {
        if(product.product.is_default) {
          bcExclusionFlag = true;
        }
      })

      const events = await AnalyticsService.getTimeseriesEvents({
        req,
        params: {
          customer_id,
          interval,
          event_names,
        },
        customer,
      });

      res.status(200).json({
        customer,
        events,
        features,
        bcExclusionFlag,
      });
    },
  }),
);

analyticsRouter.post("/raw/", async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "query raw events by customer id",
    handler: async () => {
      const { db, org, env } = req;
      const { interval, customer_id } = req.body;

      if (!customer_id) {
        throw new RecaseError({
          message: "Customer ID is required",
          code: ErrCode.InvalidRequest,
          statusCode: StatusCodes.BAD_REQUEST,
        });
      }

      let customer = await CusService.getFull({
        db,
        idOrInternalId: customer_id,
        orgId: org.id,
        env,
      });

      if (!customer) {
        throw new RecaseError({
          message: "Customer not found",
          code: ErrCode.CustomerNotFound,
          statusCode: StatusCodes.NOT_FOUND,
        });
      }

      const events = await AnalyticsService.getRawEvents({
        req,
        params: {
          customer_id: customer.internal_id,
          interval,
        },
        customer,
      });

      res.status(200).json({
        rawEvents: events,
      });
    },
  }),
);
