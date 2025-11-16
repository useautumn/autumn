import express, { type Router } from "express";
import { autumnWebhookRouter } from "../autumn/autumnWebhookRouter.js";
import { stripeWebhookRouter } from "../stripe/stripeWebhooks.js";

const webhooksRouter: Router = express.Router();

webhooksRouter.use("/stripe", stripeWebhookRouter);

webhooksRouter.use("/autumn", autumnWebhookRouter);

// Vercel webhooks are now handled in Hono (see initHono.ts)
// webhooksRouter.use("/connect", connectWebhookRouter);

export default webhooksRouter;
