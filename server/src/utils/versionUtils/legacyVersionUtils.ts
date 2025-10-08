import { LegacyVersion, type Organization } from "@autumn/shared";

export const floatToVersion = (version: number) => {
	if (Object.values(LegacyVersion).includes(version)) {
		return version;
	}

	return null;
};

export const getApiVersion = ({
	createdAt,
}: {
	createdAt: number;
}): LegacyVersion => {
	// v1.1 -- 17 April

	const v1_2 = new Date("2025-05-05");
	const v1_1 = new Date("2025-04-17");

	if (createdAt >= v1_2.getTime()) {
		return LegacyVersion.v1_2;
	}

	if (createdAt >= v1_1.getTime()) {
		return LegacyVersion.v1_1;
	}

	return LegacyVersion.v1;
};

export const orgToVersion = ({
	org,
	reqApiVersion,
}: {
	org: Organization;
	reqApiVersion?: number;
}) => {
	return reqApiVersion || LegacyVersion.v1;
};
