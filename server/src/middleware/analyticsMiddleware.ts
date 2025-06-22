const handleResFinish = (req: any, res: any) => {
  let skipUrls = ["/v1/customers/all/search"];

  try {
    if (skipUrls.includes(req.originalUrl)) {
      return;
    }

    if (process.env.NODE_ENV !== "development") {
      req.logtail.info(
        `[${res.statusCode}] ${req.method} ${req.originalUrl} (${req.org?.slug})`,
        {
          statusCode: res.statusCode,
          res: res.locals.responseBody,
        },
      );
    }
  } catch (error) {
    console.error("Failed to log response to logtailAll");
    console.error(error);
  }
};

export const analyticsMiddleware = async (req: any, res: any, next: any) => {
  // const logtailContext: any = {
  //   org_id: req.org?.id,
  //   org_slug: req.org?.slug,
  //   method: req.method,
  //   url: req.originalUrl,
  //   body: req.body,
  //   env: req.env,
  // };

  req.logtail = req.logtail.child({
    context: {
      context: {
        org_id: req.org?.id,
        org_slug: req.org?.slug,
        env: req.env,
        authType: req.authType,
        body: req.body,
      },
    },
  });

  // Store JSON response
  let originalJson = res.json;

  res.json = function (body: any) {
    res.locals.responseBody = body;
    return originalJson.call(this, body);
  };

  res.on("finish", () => handleResFinish(req, res));

  next();
};
