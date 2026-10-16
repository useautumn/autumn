import {
  balanceFromCheck,
  balanceFromCustomer,
  callAtom,
  errorMessageOf,
  servedByOf,
} from "@/lib/atom/callAtom";
import type { AtomConfig, BalanceView, ServedBy } from "@/lib/atom/types";

export type BalanceSnapshot = {
  edge: BalanceView | null;
  edgeServedBy: ServedBy;
  edgeError?: string;
  api: BalanceView | null;
  apiError?: string;
};

export const fetchBalanceSnapshot = async ({
  config,
  customerId,
  featureId,
  entityId,
}: {
  config: AtomConfig;
  customerId: string;
  featureId: string;
  entityId?: string;
}): Promise<BalanceSnapshot> => {
  const [check, customer] = await Promise.all([
    callAtom({
      request: { action: "check", params: { customerId, featureId, entityId }, config },
    }),
    callAtom({
      request: entityId
        ? { action: "getEntity", params: { customerId, entityId }, config }
        : { action: "getCustomer", params: { customerId }, config },
    }),
  ]);
  return {
    edge: balanceFromCheck({ result: check }),
    edgeServedBy: servedByOf({ attempts: check.attempts }),
    edgeError: errorMessageOf({ result: check }),
    api: balanceFromCustomer({ result: customer, featureId }),
    apiError: errorMessageOf({ result: customer }),
  };
};
