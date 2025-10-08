export const Version = {
	1: 1,
	11: 1.1,
	12: 1.2,
	14: 1.4,
} as const;

// export type ApiVersion = (typeof V)[keyof typeof V];

export enum LegacyVersion {
	v1 = 1,
	v1_1 = 1.1,
	v1_2 = 1.2,
	v1_4 = 1.4,
}
