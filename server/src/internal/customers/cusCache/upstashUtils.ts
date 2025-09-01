import "dotenv/config";
import { Redis } from "@upstash/redis";

export const initUpstash = async () => {
	if (!process.env.UPSTASH_TOKEN) {
		return null;
	}

	return new Redis({
		url: process.env.UPSTASH_URL,
		token: process.env.UPSTASH_TOKEN,
	});
};
