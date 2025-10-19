import express, { type Router } from "express";
import { autumnWebhookRouter } from "../autumn/autumnWebhookRouter.js";
import { stripeWebhookRouter } from "../stripe/stripeWebhooks.js";

const webhooksRouter: Router = express.Router();

webhooksRouter.use("/stripe", stripeWebhookRouter);

webhooksRouter.use("/autumn", autumnWebhookRouter);

// webhooksRouter.use("/connect", connectWebhookRouter);

export default webhooksRouter;
