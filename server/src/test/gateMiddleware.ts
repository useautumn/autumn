import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { AutumnCli } from "./AutumnCli.js";

const checkEntitled = async (orgId: string, featureId: string) => {
  const autumn = new AutumnCli();
  const { data, error } = await autumn.entitled({
    customerId: orgId,
    featureId,
  });

  if (error) {
    throw new RecaseError({
      message: "Failed to check entitlement",
      code: "NOT_AUTHORIZED",
      statusCode: 401,
    });
  }

  if (!data.allowed) {
    throw new RecaseError({
      message: `Feature ${featureId} limit reached`,
      code: "NOT_AUTHORIZED",
      statusCode: 401,
      data,
    });
  }

  return data.allowed;
};

const sendEvent = async (orgId: string, eventName: string) => {
  const autumn = new AutumnCli();
  const { error } = await autumn.sendEvent({
    customerId: orgId,
    eventName,
  });

  if (error) {
    throw new RecaseError({
      message: "Failed to send event",
      code: "NOT_AUTHORIZED",
      statusCode: 401,
    });
  }

  return true;
};

export const gateMiddleware = async (req: any, res: any, next: any) => {
  const orgId = req.orgId;

  console.log("Org ID", orgId);
  try {
    const autumn = new AutumnCli();

    if (req.path == "/features" && req.method == "POST") {
      await checkEntitled(orgId, "features");
      await sendEvent(orgId, "feature_created");
    } else if (req.path == "/customers" && req.method == "POST") {
      await checkEntitled(orgId, "customers");
      await sendEvent(orgId, "customer_created");
    } else if (req.path == "/products" && req.method == "POST") {
      await checkEntitled(orgId, "products");
      await sendEvent(orgId, "product_created");
    }

    next();
  } catch (error) {
    handleRequestError(error, res, "gateMiddleware");
  }
};
