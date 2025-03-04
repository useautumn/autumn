import { Organization } from "@autumn/shared";
import { Logger } from "vigilant-js";

export const createVigilantLogger = () => {
  const logger = new Logger({
    name: process.env.VIGILANT_SERVICE!,
    token: process.env.VIGILANT_API_KEY!,
  });

  return logger;
};
