import { verifyPublicKey } from "@/internal/dev/api-keys/publicKeyUtils.js";
import { AppEnv, ErrCode } from "@autumn/shared";

const allowedEndpoints = [
  {
    method: "GET",
    path: "/v1/products",
  },
  {
    method: "POST",
    path: "/v1/entitled",
  },
  {
    method: "POST",
    path: "/v1/check",
  },
  {
    method: "POST",
    path: "/v1/attach",
  },
  {
    method: "GET",
    path: "/v1/customers/:customerId",
  },
];

const isAllowedEndpoint = ({
  pattern,
  path,
  method,
}: {
  pattern: string;
  path: string;
  method: string;
}) => {
  // Convert pattern to regex, handling path params like :id
  const matchPath = (pattern: string, path: string) => {
    // Convert pattern to regex, handling path params like :id
    const regexPattern = pattern.replace(/:[^/]+/g, "[^/]+");
    const regex = new RegExp(`^${regexPattern}$`);
    // Remove query params before testing
    const pathWithoutQuery = path.split("?")[0];
    return regex.test(pathWithoutQuery);
  };

  for (const endpoint of allowedEndpoints) {
    if (endpoint.method === method && matchPath(endpoint.path, path)) {
      return true;
    }
  }
  return false;
};

export const verifyBearerPublishableKey = async (
  pkey: string,
  req: any,
  res: any,
  next: any
) => {
  try {
    if (
      !isAllowedEndpoint({
        pattern: req.originalUrl,
        path: req.originalUrl,
        method: req.method,
      })
    ) {
      return {
        error: ErrCode.EndpointNotPublic,
        fallback: false,
        statusCode: 401,
      };
    }

    if (!pkey.startsWith("am_pk_test") && !pkey.startsWith("am_pk_live")) {
      return {
        error: ErrCode.InvalidPublishableKey,
        fallback: false,
        statusCode: 400,
      };
    }

    let env: AppEnv = pkey.startsWith("am_pk_test")
      ? AppEnv.Sandbox
      : AppEnv.Live;

    const data = await verifyPublicKey({
      sb: req.sb,
      pkey,
      env,
    });

    if (!data) {
      return {
        error: ErrCode.OrgNotFound,
        fallback: false,
        statusCode: 401,
      };
    }

    let { org, features } = data;

    req.minOrg = {
      id: org.id,
      slug: org.slug,
    };
    req.orgId = org.id;
    req.env = env;
    req.isPublic = true;
    req.org = org;
    req.features = features;

    console.log("Public request from:", org.slug);
    next();
    return {
      error: null,
      fallback: null,
      statusCode: null,
    };
  } catch (error: any) {
    console.log(`Failed to get org from publishable key ${pkey}`);
    console.log(`${error}`);
    return {
      error: ErrCode.GetOrgFromPublishableKeyFailed,
      fallback: false,
      statusCode: 500,
    };
  }
};
