import { AppEnv } from "@autumn/shared";

export enum APIVersion {
  v1 = "1",
  v1_1 = "1.1",
}
export const getApiVersion = ({
  createdAt,
}: {
  createdAt: number;
}): APIVersion => {
  // v1.1 -- 17 April
  let v1_1 = new Date("2025-04-17");

  if (createdAt >= v1_1.getTime()) {
    return APIVersion.v1_1;
  }

  return APIVersion.v1;
};
