import { generateId } from "@/utils/genUtils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import {
  Entity,
  Organization,
  AppEnv,
  Customer,
  ActionInsert,
  ActionType,
  AuthType,
} from "@autumn/shared";

export const parseReqForAction = (
  req: ExtendedRequest,
): Partial<ExtendedRequest> => {
  return {
    id: req.id,
    authType: req.authType,
    originalUrl: req.originalUrl,
    method: req.method,
    body: req.body,
    timestamp: Date.now(),
  } as Partial<ExtendedRequest>;
};

export const constructAction = ({
  org,
  env,
  customer,
  entity,
  type,
  req,
  properties,
}: {
  org: Organization;
  env: AppEnv;
  customer: Customer;
  entity?: Entity;
  type: ActionType;
  req: Partial<ExtendedRequest>;
  properties?: any;
}): ActionInsert => {
  let timestampVal = req.timestamp ? new Date(req.timestamp) : new Date();

  return {
    id: generateId("act"),
    org_id: org.id,
    org_slug: org.slug,
    env,
    internal_customer_id: customer.internal_id,
    customer_id: customer.id,
    entity_id: entity?.id,
    internal_entity_id: entity?.internal_id,
    type,
    timestamp: timestampVal,

    // Request info
    request_id: req.id || "",
    method: req.method || "",
    path: (req.originalUrl || "").split("?")[0],
    auth_type: req.authType || AuthType.Unknown,

    // Properties
    properties: properties || {},
  };
};
