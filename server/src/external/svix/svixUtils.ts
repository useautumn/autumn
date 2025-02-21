import { AppEnv } from "@shared/models/genModels.js";
import { Svix } from "svix";

export const createSvixCli = () => {
  return new Svix(process.env.SVIX_API_KEY as string);
};

export const createSvixApp = async ({
  name,
  orgId,
  env,
}: {
  name: string;
  orgId: string;
  env: AppEnv;
}) => {
  const svix = createSvixCli();
  const app = await svix.application.create({
    name,
    metadata: {
      org_id: orgId,
      env,
    },
  });
  return app;
};

export const deleteSvixApp = async ({ appId }: { appId: string }) => {
  const svix = createSvixCli();
  await svix.application.delete(appId);
};

export const sendSvixEvent = async (event: any) => {
  const svix = createSvixCli();
  await svix.message.create("app_2tKDzBZtEBMQoybfckgdnb3BlJ0", {
    eventType: "product.attached",
    payload: event,
  });
};
