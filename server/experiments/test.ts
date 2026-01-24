import { AppEnv } from "autumn-js";
import { initScript } from "../src/utils/scriptUtils/scriptUtils";
import Stripe from "stripe";

export const test = async () => {
	
  const { req, stripeCli } = await initScript({
    orgId: "org_2sWv2S8LJ9iaTjLI6UtNsfL88Kt",
    env: AppEnv.Sandbox,
  });

  // 1. Create stripe empty price?


};

await test();
process.exit(0);