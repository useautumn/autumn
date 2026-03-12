import type { z } from "zod/v4";
import { ApiEntityV2Schema } from "../entities/apiEntityV2";
import { ApiCustomerV5Schema } from "./apiCustomerV5";

export const ApiSubjectV0Schema = ApiCustomerV5Schema.or(ApiEntityV2Schema);

export type ApiSubjectV0 = z.infer<typeof ApiSubjectV0Schema>;
