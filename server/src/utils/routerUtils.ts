import { ErrCode } from "@autumn/shared";
import RecaseError, {
  formatZodError,
  handleRequestError,
} from "./errorUtils.js";
import { ZodError } from "zod";
import { StatusCodes } from "http-status-codes";

export const routeHandler = async ({
  req,
  res,
  action,
  handler,
}: {
  req: any;
  res: any;
  action: string;
  handler: (req: any, res: any) => Promise<void>;
}) => {
  try {
    await handler(req, res);
  } catch (error) {
    try {
      if (error instanceof RecaseError) {
        if (error.code === ErrCode.EntityNotFound) {
          req.logtail.warn(`${error.message}, org: ${req.minOrg?.slug}`);
          return res.status(404).json({
            message: error.message,
            code: error.code,
          });
        }
      }
    } catch (error) {}

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
