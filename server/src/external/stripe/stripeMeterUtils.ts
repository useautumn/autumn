import { SupabaseClient } from "@supabase/supabase-js";

export const sendMeterEvent = async ({
  sb,
  customerId,
  event,
}: {
  sb: SupabaseClient;
  customerId: string;
  event: Event;
}) => {
  const stripeCli = createStripeCli({
    orgId: org.id,
    env: org.env,
  });
};
