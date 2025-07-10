import { Router } from "express";
import { CusService } from "../customers/CusService.js";
import { AnalyticsService } from "./AnalyticsService.js";
import { StatusCodes } from "http-status-codes";
import { ErrCode } from "@autumn/shared";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";

export const analyticsRouter = Router();

analyticsRouter.post("/events/:customer_id", async (req: any, res: any) => {
    try {
        const { db, org, env } = req;
        const { customer_id } = req.params;
        const { interval, event_names } = req.body;

        let customer = await CusService.get({
            db,
            idOrInternalId: customer_id,
            orgId: org.id,
            env,
        });

        if(!customer) {
            return handleRequestError({
                error: new RecaseError({
                    message: "Customer not found",
                    code: ErrCode.CustomerNotFound,
                    statusCode: StatusCodes.NOT_FOUND,
                }),
                req,
                res,
                action: "post_events_by_customer_id",
            })
        }

        const events = await AnalyticsService.getEvents(req, { customer_id: customer.internal_id, interval, event_names });

        res.status(200).json(events);
    } catch (error: any) {
        console.log("Error: ", error);
        return handleRequestError({
            error: new RecaseError({
                message: "An internal error occurred",
                code: ErrCode.InternalError,
                statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
            }),
            req,
            res,
            action: "post_events_by_customer_id",
        })
    }
})