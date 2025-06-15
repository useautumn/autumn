import express from "express";

import { stripeWebhookRouter } from "../stripe/stripeWebhooks.js";
import { autumnWebhookRouter } from "../autumn/autumnWebhookRouter.js";

const webhooksRouter = express.Router();

webhooksRouter.use("/stripe", stripeWebhookRouter);

webhooksRouter.use("/autumn", autumnWebhookRouter);

export default webhooksRouter;
