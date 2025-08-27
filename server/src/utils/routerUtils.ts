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
import { withSpan as withSpanTracer } from "@/internal/analytics/tracer/spanUtils.js";

/**
 * Formats Zod validation errors into user-friendly messages
 */
const formatZodValidationError = (error: ZodError): string => {
  const fieldErrors = error.issues.map(issue => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
    
    // Handle different types of validation errors with more descriptive messages
    switch (issue.code) {
      case 'invalid_type':
        if (issue.received === 'undefined') {
          return `${path} is required`;
        }
        return `${path} must be a ${issue.expected}, received ${issue.received}`;
      
      case 'too_small':
        if (issue.type === 'number') {
          return `${path} must be at least ${issue.minimum}`;
        }
        if (issue.type === 'string') {
          return `${path} must be at least ${issue.minimum} characters`;
        }
        if (issue.type === 'array') {
          return `${path} must contain at least ${issue.minimum} items`;
        }
        return `${path} is too small`;
      
      case 'too_big':
        if (issue.type === 'number') {
          return `${path} must be at most ${issue.maximum}`;
        }
        if (issue.type === 'string') {
          return `${path} must be at most ${issue.maximum} characters`;
        }
        if (issue.type === 'array') {
          return `${path} must contain at most ${issue.maximum} items`;
        }
        return `${path} is too large`;
      
      case 'invalid_enum_value':
        return `${path} must be one of: ${issue.options?.join(', ') || 'valid options'}`;
      
      case 'custom':
        return issue.message || `${path} is invalid`;
      
      default:
        return issue.message || `${path} is invalid`;
    }
  });

  // Remove duplicates and join with semicolons for multiple errors
  const uniqueErrors = [...new Set(fieldErrors)];
  return uniqueErrors.join('; ');
};

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
  withSpan = false,
}: {
  req: any;
  res: any;
  action: string;
  handler: (req: any, res: any, load: TLoad) => Promise<void>;
  validator?: ((req: any, res: any) => Promise<void>) | ZodAny | ZodObject<any, any, any, any, any>;
  withSpan?: boolean;
} & (TLoad extends undefined
  ? { loader?: never }
  : { loader: (org: Organization, env: AppEnv, db: DrizzleCli, body: any, query: any, req: ExtendedRequest) => Promise<TLoad> }
)) => {
  try {
    let load: TLoad | undefined;

    if(!withSpan) {
      if (typeof validator === 'function') {
        await validator(req, res);
              } else if(validator instanceof ZodAny || validator instanceof ZodObject) {
        const parseResult = validator.safeParse(req.body);
        if (!parseResult.success) {
          const errorMsg = formatZodValidationError(parseResult.error);
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
    } else {
      await withSpanTracer({
        name: action ?? "unknown",
        attributes: {
          org: req.org?.id,
          env: req.env,
        },
        fn: async () => {
          if (typeof validator === 'function') {
            await validator(req, res);
          } else if(validator instanceof ZodAny || validator instanceof ZodObject) {
            const parseResult = validator.safeParse(req.body);
            if (!parseResult.success) {
              const errorMsg = formatZodValidationError(parseResult.error);
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
        }
      });
    }
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
