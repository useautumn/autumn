import { AutumnMetadata } from "@autumn/shared";

import { generateId } from "@/utils/genUtils.js";
import { addDays } from "date-fns";
import { MetadataService } from "./MetadataService.js";
import { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { AttachParams } from "../customers/products/AttachParams.js";

export const createCheckoutMetadata = async ({
  sb,
  attachParams,
}: {
  sb: SupabaseClient;
  attachParams: AttachParams;
}) => {
  const metaId = generateId("meta");

  let attachClone = structuredClone(attachParams);
  if (attachClone.checkoutSessionParams) {
    delete attachClone.checkoutSessionParams;
  }

  const metadata: AutumnMetadata = {
    id: metaId,
    created_at: Date.now(),
    expires_at: addDays(Date.now(), 10).getTime(), // 10 days
    data: {
      ...attachClone,
    },
  };

  await MetadataService.insert(sb, metadata);

  return metaId;
};

export const getMetadataFromCheckoutSession = async (
  checkoutSession: Stripe.Checkout.Session,
  sb: SupabaseClient,
) => {
  const metadataId = checkoutSession.metadata?.autumn_metadata_id;

  if (!metadataId) {
    return null;
  }

  const metadata = await MetadataService.getById(sb, metadataId);

  if (!metadata) {
    return null;
  }

  return metadata;
};
