import { posthogCapture } from "@/external/posthog/posthogCapture.js";

const handleResFinish = (req: any, res: any, logtailContext: any) => {
  let skipUrls = ["/v1/customers/all/search"];

  try {
    req.logtail.flush();
    if (skipUrls.includes(req.originalUrl)) {
      return;
    }
    req.logtailAll.info(
      `[${res.statusCode}] ${req.method} ${req.originalUrl} (${req.org?.slug})`,
      {
        req: {
          ...logtailContext,
        },
        statusCode: res.statusCode,
        res: res.locals.responseBody,
      },
    );
    req.logtailAll.flush();
  } catch (error) {
    console.error("Failed to log response to logtailAll");
    console.error(error);
  }

  // Post hog
  let posthogUrls = ["/v1/attach"];
  if (req.posthog && posthogUrls.includes(req.originalUrl)) {
    posthogCapture({
      posthog: req.posthog,
      params: {
        distinctId: req.org?.id,
        event: `${req.method} ${req.originalUrl}`,
        properties: {
          orgSlug: req.org?.slug,
          statusCode: res.statusCode,
          res: res.locals.responseBody,
          req: req.body,
        },
      },
    });
  }
};

export const analyticsMiddleware = async (req: any, res: any, next: any) => {
  const logtailContext: any = {
    org_id: req.org?.id,
    org_slug: req.org?.slug,
    method: req.method,
    url: req.originalUrl,
    body: req.body,
    env: req.env,
  };

  req.logtail.use((log: any) => {
    return {
      ...log,
      ...logtailContext,
    };
  });

  // Store JSON response
  let originalJson = res.json;

  res.json = function (body: any) {
    res.locals.responseBody = body;
    return originalJson.call(this, body);
  };

  res.on("finish", () => handleResFinish(req, res, logtailContext));

  next();
};
