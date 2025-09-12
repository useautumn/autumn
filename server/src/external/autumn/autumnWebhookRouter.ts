import RecaseError from "@/utils/errorUtils.js";
import { ErrCode, WebhookEventType } from "@autumn/shared";
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
    throw new RecaseError({
      message: "Error: Missing svix headers",
      code: ErrCode.InvalidInputs,
    });
    // res.status(400).json({
    //   success: false,
    //   message: "Error: Missing svix headers",
    // });
    // return;
  }

  let evt: any;
  try {
    evt = wh.verify(payload, {
      "svix-id": svix_id as string,
      "svix-timestamp": svix_timestamp as string,
      "svix-signature": svix_signature as string,
    });
  } catch (err) {
    throw new RecaseError({
      message: "Error: Could not verify webhook",
      code: ErrCode.InvalidInputs,
    });
    // console.log("Error: Could not verify webhook");
    // res.status(400).json({
    //   success: false,
    //   message: "Error: Could not verify webhook",
    // });
    // return;
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
          console.log(`--------------------------------`);
          // console.log(`Received customer.products.updated webhook`);
          // console.log(JSON.stringify(data, null, 2));
          console.log(
            `Customer:`,
            data?.customer.id,
            `Products:`,
            data?.customer.products.map((p: any) => ({
              id: p.id,
              entity_id: p.entity_id,
              status: p.status,
              quantity: p.quantity,
            }))
          );

          if (data?.entity) {
            console.log(
              `Entity: ${data.entity.id}, Products:`,
              data.entity.products.map((p: any) => ({
                id: p.id,
                status: p.status,
                quantity: p.quantity,
              }))
            );
          }

          console.log(
            `Update product ID: ${data?.updated_product?.id}, Scenario: ${data?.scenario}`
          );
          console.log(`--------------------------------`);
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
