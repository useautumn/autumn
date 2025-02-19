import { FeatureId, sendProductEvent } from "@/external/autumn/autumnUtils.js";
import { isEntitled } from "@/external/autumn/autumnUtils.js";
import { handleRequestError } from "@/utils/errorUtils.js";

export const pricingMiddleware = async (req: any, res: any, next: any) => {
  let path = req.url;
  let method = req.method;

  let host = req.headers.host;
  if (host.includes("localhost")) {
    next();
    return;
  }

  try {
    if (path == "/products" && method == "POST") {
      await isEntitled({
        minOrg: req.minOrg,
        env: req.env,
        featureId: FeatureId.Products,
      });
    }

    next();

    if (res.statusCode === 200) {
      if (path == "/products" && method === "POST") {
        console.log("sending product create event");
        await sendProductEvent({
          minOrg: req.minOrg,
          env: req.env,
          incrementBy: 1,
        });
      }

      if (path.match(/^\/products\/[^\/]+$/) && method === "DELETE") {
        console.log("sending product delete event");
        await sendProductEvent({
          minOrg: req.minOrg,
          env: req.env,
          incrementBy: -1,
        });
      }
    }
  } catch (error) {
    handleRequestError({ req, error, res, action: "pricingMiddleware" });
    return;
  }
};
