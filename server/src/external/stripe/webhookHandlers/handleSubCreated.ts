import { CusProductStatus, Organization, ProcessorType } from "@autumn/shared";
import { AppEnv } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";

export const handleSubCreated = async ({
  sb,
  subscription,
  org,
}: {
  sb: SupabaseClient;
  subscription: Stripe.Subscription;
  org: Organization;
}) => {
  if (subscription.schedule) {
    const { data: updated } = await sb
      .from("customer_products")
      .update({
        processor: {
          type: ProcessorType.Stripe,
          subscription_id: subscription.id,
        },
        status: CusProductStatus.Active,
      })
      .eq("processor->>subscription_schedule_id", subscription.schedule)
      .select();

    if (updated && updated.length > 0) {
      console.log("Handled subscription.created");
      console.log(
        `Switched cus_prod ${updated[0].id} from sub_schedule -> sub`
      );
    }
  }
};
