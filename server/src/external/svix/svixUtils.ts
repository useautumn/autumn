import { AppEnv } from "@autumn/shared";
import { Organization } from "@autumn/shared";
import { Svix } from "svix";

export const createSvixCli = () => {
  return new Svix(process.env.SVIX_API_KEY as string);
};

export const getSvixAppId = ({
  org,
  env,
}: {
  org: Organization;
  env: AppEnv;
}) => {
  const svixConfig = org.svix_config;
  return env == AppEnv.Live
    ? svixConfig.live_app_id
    : svixConfig.sandbox_app_id;
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

export const sendSvixEvent = async ({
  org,
  eventType,
  data,
}: {
  org: Organization;
  eventType: string;
  data: any;
}) => {
  const svix = createSvixCli();
  // await svix.message.create(getSvixAppId({ org, env: org.env }), {
  //   eventType,
  //   payload: data,
  // });
};

export const getSvixDashboardUrl = async ({
  org,
  env,
}: {
  org: Organization;
  env: AppEnv;
}) => {
  const appId = getSvixAppId({ org, env });

  const svix = createSvixCli();
  const dashboard = await svix.authentication.appPortalAccess(appId, {});
  return dashboard.url;
};
