import { verifyPublicKey } from "@/internal/dev/api-keys/publicKeyUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { AppEnv, AuthType, ErrCode } from "@autumn/shared";

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

export interface IsAllowedEndpointProps {
  pattern: string;
  path: string;
  method: string;
}

const isAllowedEndpoint = ({
  pattern,
  path,
  method,
}: IsAllowedEndpointProps) => {
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
  next: any,
) => {
  if (
    !isAllowedEndpoint({
      pattern: req.originalUrl,
      path: req.originalUrl,
      method: req.method,
    })
  ) {
    throw new RecaseError({
      message: `Endpoint ${req.originalUrl} not accessable via publishable key. Please try with a secret key instead.`,
      code: ErrCode.EndpointNotPublic,
      statusCode: 401,
    });
  }

  if (!pkey.startsWith("am_pk_test") && !pkey.startsWith("am_pk_live")) {
    throw new RecaseError({
      message: "Invalid publishable key",
      code: ErrCode.InvalidPublishableKey,
      statusCode: 401,
    });
  }

  let env: AppEnv = pkey.startsWith("am_pk_test")
    ? AppEnv.Sandbox
    : AppEnv.Live;

  const data = await verifyPublicKey({
    db: req.db,
    pkey,
    env,
  });

  if (!data) {
    throw new RecaseError({
      message: "Invalid publishable key",
      code: ErrCode.InvalidPublishableKey,
      statusCode: 401,
    });
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
  req.authType = AuthType.PublicKey;

  next();
  return;
};
