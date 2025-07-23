import "dotenv/config";
import { Redis } from "@upstash/redis";

export const initUpstash = async () => {
  if (!process.env.UPSTASH_TOKEN) {
    return null;
  }

  return new Redis({
    url: "https://divine-sheepdog-46319.upstash.io",
    token: process.env.UPSTASH_TOKEN,
  });
};
