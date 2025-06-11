import { Organization, APIVersion } from "@autumn/shared";

export const floatToVersion = (version: number) => {
  if (Object.values(APIVersion).includes(version)) {
    return version;
  }

  return null;
};

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

export const orgToVersion = ({
  org,
  reqApiVersion,
}: {
  org: Organization;
  reqApiVersion?: number;
}) => {
  return reqApiVersion || org.api_version || APIVersion.v1;
};
