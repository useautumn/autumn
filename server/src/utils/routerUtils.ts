import { handleRequestError } from "./errorUtils.js";

export const routeHandler = async ({
  req,
  res,
  action,
  handler,
}:{
  req: any;
  res: any;
  action: string;
  handler: (req: any, res: any) => Promise<void>;
}) => {
  try {
    await handler(req, res);
  } catch (error) {
    handleRequestError({
      error,
      req,
      res,
      action,
    });
  }
}