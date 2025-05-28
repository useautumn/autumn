import { ErrCode } from "@autumn/shared";
import RecaseError, { handleRequestError } from "./errorUtils.js";

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

    handleRequestError({
      error,
      req,
      res,
      action,
    });
  }
};
