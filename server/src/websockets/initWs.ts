import { WebSocketServer } from "ws";
import http from "http";

import { createSupabaseClient } from "@/external/supabaseUtils.js";
import { AppEnv, ErrCode } from "@autumn/shared";
import { OrgService } from "@/internal/orgs/OrgService.js";
import {
  getBalanceForFeature,
  getCusBalances,
} from "@/internal/customers/entitlements/cusEntUtils.js";

export enum SbChannelEvent {
  BalanceUpdated = "balance_updated",
}

interface RouteInfo {
  pattern: RegExp;
  paramNames: string[];
  callback: (
    ws: WebSocket,
    req: http.IncomingMessage,
    params: Record<string, string>
  ) => Promise<void>;
}

const getPkey = async (req: any) => {
  const query = req.url.split("?")[1];
  const queryParams = new URLSearchParams(query);
  const pkey = req.headers["x-publishable-key"] || queryParams.get("pkey");

  if (!pkey) {
    throw new Error("No publishable key found");
  }

  if (typeof pkey !== "string") {
    throw new Error("Invalid publishable key");
  }

  if (!pkey.startsWith("am_pk_test_") && !pkey.startsWith("am_pk_live_")) {
    throw new Error("Invalid publishable key");
  }

  const env = pkey.startsWith("am_pk_test_") ? AppEnv.Sandbox : AppEnv.Live;
  const sb = createSupabaseClient();
  const org = await OrgService.getFromPkey({ sb, pkey, env });

  if (!org) {
    return {
      error: ErrCode.OrgNotFound,
      fallback: false,
      statusCode: 401,
    };
  }

  req.env = env;
  req.org = org;

  return { env, org };
};

class WebSocketRouter {
  private wss: WebSocketServer;
  private routes: RouteInfo[] = [];

  public on({
    route,
    callback,
  }: {
    route: string;
    callback: (
      ws: WebSocket,
      req: any,
      params: Record<string, string>
    ) => Promise<void>;
  }) {
    const paramNames: string[] = [];
    const pattern = route.replace(/:([^/]+)/g, (_, paramName) => {
      paramNames.push(paramName);
      return "([^/]+)";
    });
    this.routes.push({
      pattern: new RegExp(`^${pattern}$`),
      paramNames,
      callback,
    });
  }

  constructor(server: http.Server) {
    this.wss = new WebSocketServer({ server });
    this.wss.on("connection", (ws, req) =>
      this.handleConnection(ws as any, req as any)
    );
  }

  private async handleConnection(ws: WebSocket, req: any) {
    const path = req.url;

    try {
      const { env, org } = await getPkey(req);
      req.sb = createSupabaseClient();
    } catch (error) {
      console.log("Failed to get org from pkey");
      ws.close(1000, "Invalid publishable key");
      return;
    }

    for (const route of this.routes) {
      const match = path.match(route.pattern);
      if (match) {
        // Extract params from match groups
        const params: Record<string, string> = {};
        route.paramNames.forEach((name, index) => {
          params[name] = match[index + 1];
        });
        route.callback(ws, req, params);
        return;
      }
    }

    if (!path) {
      ws.close(1000, "No path found");
      return;
    }

    ws.close(1000, "Route not found");
  }
}

export const initWs = (server: http.Server) => {
  const wsRouter = new WebSocketRouter(server);

  wsRouter.on({
    route: "/:customer_id/entitlements",
    callback: async (ws, req, params) => {
      await handleRealtimeBalances(ws, req, params);
    },
  });

  wsRouter.on({
    route: "/:customer_id/entitlements/:feature_id",
    callback: async (ws, req, params) => {
      await handleRealtimeBalance(ws, req, params);
    },
  });
};

const handleRealtimeBalances = async (ws: WebSocket, req: any, params: any) => {
  try {
    const { org, env, sb } = req;

    // 1. Get all customer balances
    const balances = await getCusBalances({
      sb,
      customerId: params.customer_id,
      orgId: org.id,
      env,
    });

    ws.send(JSON.stringify({ data: balances, error: null }));

    const channel = `${org.id}_${env}_${params.customer_id}`;

    sb.channel(channel)
      .on(
        "broadcast",
        { event: SbChannelEvent.BalanceUpdated },
        async (payload: any) => {
          const data = payload.payload;
          console.log("Received balance update event from supabase:", data);
          const newBalances = await getCusBalances({
            sb,
            customerId: params.customer_id,
            orgId: org.id,
            env,
          });
          ws.send(
            JSON.stringify({
              data: newBalances,
              error: null,
            })
          );
        }
      )
      .subscribe();
  } catch (error) {
    console.log("Error getting customer balances", error);
    ws.send(
      JSON.stringify({
        data: null,
        error: "Error getting customer balances",
      })
    );
  }
};

const handleRealtimeBalance = async (ws: WebSocket, req: any, params: any) => {
  try {
    const { org, env, sb } = req;

    const channel = `${org.id}_${env}_${params.customer_id}`;

    const curBalance = await getBalanceForFeature({
      sb,
      customerId: params.customer_id,
      orgId: org.id,
      env,
      featureId: params.feature_id,
    });

    ws.send(JSON.stringify({ data: curBalance, error: null }));

    sb.channel(channel)
      .on(
        "broadcast",
        { event: SbChannelEvent.BalanceUpdated },
        async (payload: any) => {
          if (payload.payload.feature_id !== params.feature_id) {
            return;
          }

          const newBalance = await getBalanceForFeature({
            sb,
            customerId: params.customer_id,
            orgId: org.id,
            env,
            featureId: params.feature_id,
          });

          ws.send(
            JSON.stringify({
              data: newBalance,
              error: null,
            })
          );
        }
      )
      .subscribe();
  } catch (error) {
    console.log("Error getting feature balance", error);
    ws.send(
      JSON.stringify({
        data: null,
        error: "Error getting feature balance",
      })
    );
  }
};
