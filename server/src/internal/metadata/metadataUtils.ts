import Stripe from "stripe";
import { AutumnMetadata } from "@autumn/shared";
import { generateId } from "@/utils/genUtils.js";
import { addDays } from "date-fns";
import { MetadataService } from "./MetadataService.js";
import { AttachParams } from "../customers/cusProducts/AttachParams.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

export const createCheckoutMetadata = async ({
  db,
  attachParams,
}: {
  db: DrizzleCli;
  attachParams: AttachParams;
}) => {
  const metaId = generateId("meta");

  let { req, checkoutSessionParams, ...rest } = attachParams;

  let attachClone = structuredClone(rest);

  const metadata: AutumnMetadata = {
    id: metaId,
    created_at: Date.now(),
    expires_at: addDays(Date.now(), 10).getTime(), // 10 days
    data: {
      ...attachClone,
    },
  };

  await MetadataService.insert({ db, data: metadata });

  return metaId;
};

export const getMetadataFromCheckoutSession = async (
  checkoutSession: Stripe.Checkout.Session,
  db: DrizzleCli,
) => {
  const metadataId = checkoutSession.metadata?.autumn_metadata_id;

  if (!metadataId) {
    return null;
  }

  const metadata = await MetadataService.get({
    db,
    id: metadataId,
  });

  if (!metadata) {
    return null;
  }

  return metadata;
};
