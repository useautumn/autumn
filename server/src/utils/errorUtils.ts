import { ErrCode } from "@autumn/shared";
import chalk from "chalk";
import { StatusCodes } from "http-status-codes";
import Stripe from "stripe";
import { ZodError } from "zod";

export const isPaymentDeclined = (error: any) => {
  return (
    error instanceof RecaseError && error.code === ErrCode.StripeCardDeclined
  );
};

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

  print(logger: any) {
    logger.warn(`Code:    ${chalk.yellow(this.code)}`);
    logger.warn(`Message: ${chalk.yellow(this.message)}`);

    if (this.data) {
      logger.warn(`Data:`);
      logger.warn(this.data);
    } else {
      logger.warn("No data");
    }
  }
}

export function formatZodError(error: ZodError): string {
  return error.errors
    .map((err) => `${err.path.join(".")}: ${err.message}`)
    .join(", ");
}

const getJsonBody = (body: any) => {
  if (Buffer.isBuffer(body)) {
    try {
      return JSON.parse(body.toString());
    } catch (e) {
      return `[Invalid JSON] Raw body: ${body.toString()}`;
    }
  }
  return body;
};

const logRequestBody = (logger: any, req: any, level: "warn" | "error") => {
  if (
    req.body &&
    typeof req.body === "object" &&
    Object.keys(req.body).length > 0
  ) {
    logger[level]("Request body:");
    logger[level](getJsonBody(req.body));
  }
};

const logReqUrl = (logger: any, req: any, level: "warn" | "error") => {
  if (req.originalUrl.includes("/webhooks/stripe")) {
    logger[level](`Stripe webhook: ${req.originalUrl}`);
    let body = req.body;
    try {
      body = Buffer.isBuffer(req.body)
        ? JSON.parse(req.body.toString())
        : req.body;

      logger[level](`Event type: ${body.type}, ID: ${body.id}`);
    } catch (error) {
      logger[level](`Invalid JSON body`);
    }
  } else {
    logger[level](`${req.method} ${req.originalUrl}`);
  }
};

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
  try {
    const logger = req.logtail;
    if (error instanceof RecaseError) {
      logger.warn("--------------------------------");
      logger.warn(`RECASE WARNING`);
      // logger.warn(`${req.method} ${req.originalUrl}`);
      logReqUrl(logger, req, "warn");
      logger.warn(
        `Request from ${
          req.minOrg?.slug || req.org?.slug || req.orgId || "unknown"
        } for ${action}`
      );
      error.print(logger);
      logRequestBody(logger, req, "warn");

      logger.warn("--------------------------------");
      res.status(error.statusCode).json({
        message: error.message,
        code: error.code,
      });
      return;
    }

    logger.error("--------------------------------");
    logger.error("ERROR");
    // logger.error(`${req.method} ${req.originalUrl}`);
    logReqUrl(logger, req, "error");
    logger.error(
      `Request from ${
        req.minOrg?.slug || req.org?.slug || req.orgId || "unknown"
      } for ${action}`
    );

    logRequestBody(logger, req, "error");

    if (error instanceof Stripe.errors.StripeError) {
      logger.error("Type: StripeError");
      logger.error(error.message);
      res.status(400).json({
        message: error.message,
        code: ErrCode.InvalidInputs,
      });
    } else if (error instanceof ZodError) {
      logger.error("Type: ZodError");
      logger.error(formatZodError(error));
      res.status(400).json({
        message: formatZodError(error),
        code: ErrCode.InvalidInputs,
      });
    } else {
      logger.error(`Type: Unknown`);
      logger.error(error);
      res.status(500).json({ message: "Internal server error" });
    }
    logger.error("--------------------------------");
  } catch (error) {
    console.log("Failed to log error / warning");
    console.log(`Request: ${req.originalUrl}`);
    console.log(`Body: ${req.body}`);
    console.log(`Log Error: ${error}`);
  }
};

export const handleFrontendReqError = ({
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
  try {
    let logger = req.logtail;
    req.logtail.use((log: any) => {
      return {
        ...log,
        from_frontend: true,
      };
    });

    if (
      error instanceof RecaseError &&
      error.statusCode == StatusCodes.NOT_FOUND
    ) {
      req.logtail.warn(
        `(frontend) ${req.method} ${req.originalUrl}: not found`
      );
      res.status(404).json({
        message: error.message,
        code: error.code,
      });
      return;
    }

    logger.warn("--------------------------------");
    logger.warn("FRONTEND REQUEST WARNING");
    logger.warn(`${req.method} ${req.originalUrl}`, {
      type: "frontend_request",
    });
    logger.warn(`${action}`);
    logger.warn(`${error}`);
  } catch (error) {
    console.log("Failed to log error / warning");
  }
};
