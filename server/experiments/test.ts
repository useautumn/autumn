import { AppEnv } from "autumn-js";
import { initScript } from "../src/utils/scriptUtils/scriptUtils";

export const test = async () => {
	
  const { req, stripeCli } = await initScript({
    orgId: "org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt",
    env: AppEnv.Sandbox,
  });

  const subscription = await stripeCli.subscriptions.retrieve("sub_1Sr2ln5NEqgjQ4gyJfi9oZVl");
  console.log(subscription);
};

await test();
process.exit(0);