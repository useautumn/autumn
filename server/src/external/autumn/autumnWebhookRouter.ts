import { WebhookEventType } from "@autumn/shared";
import express, { Router } from "express";
import { Webhook } from "svix";

export const autumnWebhookRouter: Router = express.Router();

const verifyAutumnWebhook = async (req: any, res: any) => {
  const wh = new Webhook(process.env.AUTUMN_WEBHOOK_SECRET!);

  const headers = req.headers;
  const payload = req.body;

  const svix_id = headers["svix-id"];
  const svix_timestamp = headers["svix-timestamp"];
  const svix_signature = headers["svix-signature"];

  if (!svix_id || !svix_timestamp || !svix_signature) {
    res.status(400).json({
      success: false,
      message: "Error: Missing svix headers",
    });
    return;
  }

  let evt: any;
  try {
    evt = wh.verify(payload, {
      "svix-id": svix_id as string,
      "svix-timestamp": svix_timestamp as string,
      "svix-signature": svix_signature as string,
    });
  } catch (err) {
    console.log("Error: Could not verify webhook");
    res.status(400).json({
      success: false,
      message: "Error: Could not verify webhook",
    });
    return;
  }

  return evt;
};

autumnWebhookRouter.post(
  "",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const evt = await verifyAutumnWebhook(req, res);
      console.log("Received webhook from autumn");
      const { type, data } = evt;

      switch (type) {
        case WebhookEventType.CustomerProductsUpdated:
          console.log(
            `Type: ${type}, Scenario: ${data?.scenario}, Product: ${data?.updated_product?.id}`
          );
          break;
        case WebhookEventType.CustomerThresholdReached:
          console.log(`Type: ${type}`);
          console.log(`Feature: `, data?.feature);
          break;
      }

      res.status(200).json({
        success: true,
        message: "Webhook received",
      });
    } catch (error) {
      res.status(200).json({
        success: false,
        message: "Error: Could not verify webhook",
      });
      return;
    }
  }
);
