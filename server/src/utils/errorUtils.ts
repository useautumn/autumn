import { ErrCode } from "@autumn/shared";
import chalk from "chalk";
import Stripe from "stripe";
import { ZodError } from "zod";

export default class RecaseError extends Error {
  code: string;
  data: any;
  statusCode: number;

  constructor({
    message,
    code,
    data,
    statusCode = 500,
  }: {
    message: string;
    code: string;
    data?: any;
    statusCode?: number;
  }) {
    super(message);
    this.name = "RecaseError";
    this.code = code;
    this.data = data;
    this.statusCode = statusCode;
  }

  print() {
    console.warn(`RECASE WARNING\n${this.code}: ${this.message}`);
    if (this.data) {
      console.warn(this.data);
    } else {
      console.warn("No data");
    }
  }
}

export function formatZodError(error: ZodError): string {
  return error.errors
    .map((err) => `${err.path.join(".")}: ${err.message}`)
    .join(", ");
}

export const handleRequestError = ({
  error,
  req,
  res,
  action,
}: {
  error: any;
  req: any;
  res: any;
  action: string;
}) => {
  if (error instanceof RecaseError) {
    console.warn("--------------------------------");
    console.warn("WARNING");
    console.warn(`${req.method} ${req.originalUrl}`);
    console.warn(
      `Request from ${
        req.minOrg?.slug || req.org?.slug || req.orgId || "unknown"
      }`
    );
    console.warn(
      `Request body:`,
      Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body
    );

    error.print();
    console.warn("--------------------------------");
    res.status(error.statusCode).json({
      message: error.message,
      code: error.code,
    });
    return;
  }

  console.error("--------------------------------");
  console.error("ERROR");
  console.error(`${req.method} ${req.originalUrl}`);
  console.error(
    `Request from ${
      req.minOrg?.slug || req.org?.slug || req.orgId || "unknown"
    }`
  );

  console.error(
    `Request body:`,
    Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body
  );

  if (error instanceof Stripe.errors.StripeError) {
    console.error("STRIPE ERROR");
    console.error(error.message);
    res.status(400).json({
      message: error.message,
      code: ErrCode.InvalidInputs,
    });
  } else if (error instanceof ZodError) {
    console.error("ZOD ERROR");
    console.error(formatZodError(error));
    res.status(400).json({
      message: formatZodError(error),
      code: ErrCode.InvalidInputs,
    });
  } else {
    console.error(`Unknown error | ${action}`, error);
    res.status(500).json({ message: "Internal server error" });
  }
  console.error("--------------------------------");
};
