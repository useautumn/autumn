import { AppEnv, ErrCode, Organization } from "@autumn/shared";
import RecaseError, {
  formatZodError,
  handleRequestError,
} from "./errorUtils.js";
import { ZodAny, ZodError, ZodObject } from "zod";
import { StatusCodes } from "http-status-codes";
import Stripe from "stripe";
import { DrizzleCli } from "@/db/initDrizzle.js";
import { ExtendedRequest } from "./models/Request.js";

/**
 * Type-safe route handler with optional loader function.
 *
 * @example
 * // Without loader (load parameter is undefined)
 * routeHandler({
 *   req, res, action: "get user",
 *   handler: (req, res, load) => {
 *     // load is undefined
 *   }
 * });
 *
 * @example
 * // With loader (load parameter is inferred from loader return type)
 * routeHandler({
 *   req, res, action: "get user",
 *   loader: async (org, env, db) => ({ user: await db.query(...) }),
 *   handler: (req, res, load) => {
 *     // load is { user: User } - fully type-safe!
 *   }
 * });
 */

export const routeHandler = async <TLoad = undefined>({
  req,
  res,
  action,
  handler,
  validator,
  loader,
}: {
  req: any;
  res: any;
  action: string;
  handler: (req: any, res: any, load: TLoad) => Promise<void>;
  validator?: ((req: any, res: any) => Promise<void>) | ZodAny | ZodObject<any, any, any, any, any>;
} & (TLoad extends undefined
  ? { loader?: never }
  : { loader: (org: Organization, env: AppEnv, db: DrizzleCli, body: any, query: any, req: ExtendedRequest) => Promise<TLoad> }
)) => {
  try {
    let load: TLoad | undefined;
    if (typeof validator === 'function') {
      await validator(req, res);
    } else if(validator instanceof ZodAny || validator instanceof ZodObject) {
      const parseResult = validator.safeParse(req.body);
      if (!parseResult.success) {
        const errorMsg =
          parseResult.error.errors[0]?.message || "Invalid request body";
        throw new RecaseError({
          message: errorMsg,
          code: ErrCode.InvalidRequest,
        });
      }
    }
    if (loader) {
      load = await loader((req as ExtendedRequest).org, (req as ExtendedRequest).env, (req as ExtendedRequest).db, req.body, req.query, req);
    }
    await handler(req, res, load as TLoad);
  } catch (error) {
    try {
      if (error instanceof RecaseError) {
        if (error.code === ErrCode.EntityNotFound) {
          req.logtail.warn(
            `${error.message}, org: ${req.org?.slug || req.orgId}`,
          );
          return res.status(404).json({
            message: error.message,
            code: error.code,
          });
        }
      }
    } catch (error) {}

    let originalUrl = req.originalUrl;
    if (error instanceof Stripe.errors.StripeError) {
      if (
        originalUrl.includes("/billing_portal") &&
        error.message.includes("Provide a configuration or create your default")
      ) {
        req.logtail.warn(`Billing portal config error, org: ${req.org?.slug}`);
        return res.status(404).json({
          message: error.message,
          code: ErrCode.InvalidRequest,
        });
      }

      if (
        originalUrl.includes("/billing_portal") &&
        error.message.includes(
          "Invalid URL: An explicit scheme (such as https)",
        )
      ) {
        req.logtail.warn(
          `Billing portal return_url error, org: ${req.org?.slug}, return_url: ${req.body.return_url}`,
        );
        return res.status(400).json({
          message: error.message,
          code: ErrCode.InvalidRequest,
        });
      }
    }

    if (error instanceof ZodError && req.originalUrl.includes("/attach")) {
      error = new RecaseError({
        message: formatZodError(error),
        code: ErrCode.InvalidInputs,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    handleRequestError({
      error,
      req,
      res,
      action,
    });
  }
};
