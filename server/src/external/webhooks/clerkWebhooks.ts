import { Request, Response } from "express";
import { verifySvixSignature } from "./webhookUtils.js";
import { createSupabaseClient } from "../supabaseUtils.js";

export const handleClerkWebhook = async (req: Request, res: Response) => {
  let verified = false;
  try {
    verified = await verifySvixSignature(req, res);
  } catch (error: any) {
    console.error("Error verifying webhook:", error?.message);
    res.status(500).json({
      success: false,
      message: "Error verifying webhook",
    });
    return;
  }

  if (!verified) {
    console.error("Error: Could not verify webhook");
    res.status(400).json({
      success: false,
      message: "Error: Could not verify webhook",
    });
    return;
  }
  console.log("CLERK webhook verified");

  const eventType = req.body.type;
  const eventData = req.body.data;

  try {
    switch (eventType) {
      case "organization.created":
        // await handleOrgCreated(eventData);
        break;
      case "organization.deleted":
        // await handleOrgDeleted(eventData);
        break;
      default:
        break;
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error handling webhook",
    });
    return;
  }

  return void res.status(200).json({
    success: true,
    message: "Webhook received",
  });
};

const handleOrgCreated = async (eventData: any) => {
  console.log("Org created", eventData);
  const { id: orgId, created_at, name, slug } = eventData;

  const supabase = createSupabaseClient();
  const { data, error } = await supabase.from("organizations").insert({
    id: orgId,
    created_at,
    name,
    slug,
  });

  if (error) {
    console.error("Error creating organization", error);
    throw new Error("Error creating organization");
  }

  console.log("Supabase organization created");
  return;
};

const handleOrgDeleted = async (eventData: any) => {
  console.log("Org deleted", eventData);
  const { id: orgId } = eventData;

  const supabase = createSupabaseClient();
  const { data, error } = await supabase
    .from("organizations")
    .delete()
    .eq("id", orgId);

  if (error) {
    console.error("Error deleting organization", error);
    throw new Error("Error deleting organization");
  }

  console.log("Supabase organization deleted");
  return;
};
