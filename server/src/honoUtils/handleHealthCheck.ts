import type { Context } from "hono";
import type { HonoEnv } from "./HonoEnv";

export const handleHealthCheck = async (c: Context<HonoEnv>) => {
	return c.text("Hello from Autumn 🍂🍂🍂");
};
