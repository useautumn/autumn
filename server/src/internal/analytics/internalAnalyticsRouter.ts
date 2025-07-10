import { Router } from "express";
import { CusService } from "../customers/CusService.js";
import { AnalyticsService } from "./AnalyticsService.js";
import { StatusCodes } from "http-status-codes";
import { ErrCode } from "@autumn/shared";
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

      let customer = await CusService.get({
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

      console.log("Query input:", {
        customer_id,
        interval,
        event_names,
      });

      const events = await AnalyticsService.getEvents({
        req,
        params: {
          customer_id: customer.internal_id,
          interval,
          event_names,
        },
      });

      console.log("Events output:", events);

      res.status(200).json({
        customer,
        events,
        features,
      });
    },
  }),
);
