import { APIVersion, AppEnv } from "@autumn/shared";

export const getApiVersion = ({
  createdAt,
}: {
  createdAt: number;
}): APIVersion => {
  // v1.1 -- 17 April
  let v1_2 = new Date("2025-05-05");
  let v1_1 = new Date("2025-04-17");

  if (createdAt >= v1_2.getTime()) {
    return APIVersion.v1_2;
  }

  if (createdAt >= v1_1.getTime()) {
    return APIVersion.v1_1;
  }

  return APIVersion.v1;
};
