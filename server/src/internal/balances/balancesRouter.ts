import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleCheck } from "../api/check/handleCheck.js";
import { handleBatchTrack } from "./handlers/handleBatchTrack.js";
import { handleCreateBalance } from "./handlers/handleCreateBalance.js";
import { handleDeleteBalance } from "./handlers/handleDeleteBalance.js";
import { handleFinalizeLock } from "./handlers/handleFinalizeLock.js";
import { handleListBalances } from "./handlers/handleListBalances.js";
import { handleRecalculateBalance } from "./handlers/handleRecalculateBalance.js";
import { handleRecalculateBalancePreview } from "./handlers/handleRecalculateBalancePreview.js";
import { handleSetUsage } from "./handlers/handleSetUsage.js";
import { handleTrack } from "./handlers/handleTrack.js";
import { handleTrackTokens } from "./handlers/handleTrackTokens.js";
import { handleUpdateBalance } from "./handlers/handleUpdateBalance.js";

// Create a Hono app for products
export const balancesRouter = new Hono<HonoEnv>();

balancesRouter.post("/balances/create", ...handleCreateBalance);
balancesRouter.get("/balances/list", ...handleListBalances);
balancesRouter.post("/balances/update", ...handleUpdateBalance);
balancesRouter.post("/balances/recalculate", ...handleRecalculateBalance);
balancesRouter.post(
	"/balances/preview_recalculate",
	...handleRecalculateBalancePreview,
);

// Track
balancesRouter.post("/events", ...handleTrack);
balancesRouter.post("/track", ...handleTrack);
balancesRouter.post("/track_tokens", ...handleTrackTokens);

// Check
balancesRouter.post("/entitled", ...handleCheck);
balancesRouter.post("/check", ...handleCheck);

// Legacy
balancesRouter.post("/usage", ...handleSetUsage);

export const balancesRpcRouter = new Hono<HonoEnv>();
balancesRpcRouter.post("/balances.create", ...handleCreateBalance);
balancesRpcRouter.post("/balances.update", ...handleUpdateBalance);
balancesRpcRouter.post("/balances.delete", ...handleDeleteBalance);
balancesRpcRouter.post("/balances.recalculate", ...handleRecalculateBalance);
balancesRpcRouter.post(
	"/balances.preview_recalculate",
	...handleRecalculateBalancePreview,
);

balancesRpcRouter.post("/balances.track", ...handleTrack);
balancesRpcRouter.post("/balances.track_tokens", ...handleTrackTokens);
balancesRpcRouter.post("/balances.batch_track", ...handleBatchTrack);
balancesRpcRouter.post("/balances.check", ...handleCheck);
balancesRpcRouter.post("/balances.finalize", ...handleFinalizeLock);
