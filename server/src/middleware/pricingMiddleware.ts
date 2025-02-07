import { FeatureId, sendProductEvent } from "@/external/autumn/autumnUtils.js";
import { isEntitled } from "@/external/autumn/autumnUtils.js";
import { handleRequestError } from "@/utils/errorUtils.js";

export const pricingMiddleware = async (req: any, res: any, next: any) => {
  let path = req.url;
  let method = req.method;

  let host = req.headers.host;
  if (
    host.includes("localhost") ||
    req.minOrg.slug == "autumn" ||
    req.minOrg.slug == "firecrawl" ||
    req.minOrg.slug == "pipeline" ||
    req.minOrg.slug == "alex"
  ) {
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

    // if (path == "/attach" && method == "POST") {
    //   await isEntitled({
    //     minOrg: req.minOrg,
    //     env: req.env,
    //     featureId: FeatureId.Revenue,
    //   });
    // }

    next();
  } catch (error) {
    handleRequestError({ req, error, res, action: "pricingMiddleware" });
    return;
  }

  if (res.statusCode === 200) {
    if (path == "/products" && method === "POST") {
      await sendProductEvent({
        minOrg: req.minOrg,
        env: req.env,
        incrementBy: 1,
      });
    }

    if (path.match(/^\/products\/[^\/]+$/) && method === "DELETE") {
      await sendProductEvent({
        minOrg: req.minOrg,
        env: req.env,
        incrementBy: -1,
      });
    }
  }
};
