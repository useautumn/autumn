import type http from "node:http";
import { AppEnv, ErrCode } from "@autumn/shared";
import { type WebSocket, WebSocketServer } from "ws";

export enum SbChannelEvent {
	BalanceUpdated = "balance_updated",
}

interface RouteInfo {
	pattern: RegExp;
	paramNames: string[];
	callback: (
		ws: WebSocket,
		req: http.IncomingMessage,
		params: Record<string, string>,
	) => Promise<void>;
}

const _getPkey = async (req: any) => {
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

	const _env = pkey.startsWith("am_pk_test_") ? AppEnv.Sandbox : AppEnv.Live;

	return {
		error: ErrCode.OrgNotFound,
		fallback: false,
		statusCode: 401,
	};
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
			params: Record<string, string>,
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
		this.wss.on("connection", (ws: WebSocket, req: http.IncomingMessage) =>
			this.handleConnection(ws as any, req as any),
		);
	}

	private async handleConnection(ws: WebSocket, req: any) {
		const path = req.url;

		// try {
		// } catch (_error) {
		// 	console.log("Failed to get org from pkey");
		// 	ws.close(1000, "Invalid publishable key");
		// 	return;
		// }

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
		callback: async (_ws, _req, params) => {
			console.log("entitlements", params);
		},
	});

	wsRouter.on({
		route: "/:customer_id/entitlements/:feature_id",
		callback: async (_ws, _req, params) => {
			console.log("entitlement", params);
		},
	});
};
