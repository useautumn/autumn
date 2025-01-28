import { decryptData } from "@/utils/encryptUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { AppEnv, ErrCode, Organization } from "@autumn/shared";

export const getStripeWebhookSecret = (org: Organization, env: AppEnv) => {
  if (!org.stripe_config) {
    throw new RecaseError({
      code: ErrCode.StripeConfigNotFound,
      message: `Stripe config not found for org ${org.id}`,
      statusCode: 400,
    });
  }

  const webhookSecret =
    env === AppEnv.Sandbox
      ? org.stripe_config.test_webhook_secret
      : org.stripe_config!.live_webhook_secret;

  return decryptData(webhookSecret);
};

export const initDefaultConfig = () => {
  return {
    free_trial_paid_to_paid: false,
  };
};
