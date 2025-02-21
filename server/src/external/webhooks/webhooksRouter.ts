import express from "express";
import bodyParser from "body-parser";
import { handleClerkWebhook } from "./clerkWebhooks.js";
import { stripeWebhookRouter } from "../stripe/stripeWebhooks.js";
import { autumnWebhookRouter } from "../autumn/autumnWebhookRouter.js";

const webhooksRouter = express.Router();

webhooksRouter.use("/stripe", stripeWebhookRouter);

webhooksRouter.use("/autumn", autumnWebhookRouter);

webhooksRouter.post(
  "/clerk",
  bodyParser.raw({ type: "application/json" }),
  handleClerkWebhook
);

export default webhooksRouter;
