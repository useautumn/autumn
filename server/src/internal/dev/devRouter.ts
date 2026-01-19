import { Hono } from "hono";
import type { HonoEnv } from "../../honoUtils/HonoEnv.js";
import { handleCliStripe } from "./handlers/handleCliStripe.js";
import { handleCreateOtp } from "./handlers/handleCreateOtp.js";
import { handleCreateSecretKey } from "./handlers/handleCreateSecretKey.js";
import { handleDeleteSecretKey } from "./handlers/handleDeleteSecretKey.js";
import { handleGetDevData } from "./handlers/handleGetDevData.js";
import { handleGetOtp } from "./handlers/handleGetOtp.js";

// Unauthenticated CLI routes (no session required)
export const publicDevRouter = new Hono<HonoEnv>();
publicDevRouter.get("/otp/:otp", ...handleGetOtp);
publicDevRouter.post("/cli/stripe", ...handleCliStripe);

export const internalDevRouter = new Hono<HonoEnv>();
internalDevRouter.post("/otp", ...handleCreateOtp);
internalDevRouter.get("/data", ...handleGetDevData);
internalDevRouter.post("/api_key", ...handleCreateSecretKey);
internalDevRouter.delete("/api_key/:key_id", ...handleDeleteSecretKey);
