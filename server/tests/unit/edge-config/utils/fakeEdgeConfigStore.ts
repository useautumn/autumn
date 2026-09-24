import { jest } from "bun:test";

/** Registry-facing store double: counts refreshes and reports a settable health. */
export const createFakeEdgeConfigStore = ({ s3Key }: { s3Key: string }) => {
	let healthy = true;
	return {
		s3Key,
		refresh: jest.fn(async () => {}),
		getStatus: () => ({ configured: true, healthy }),
		applyRaw: jest.fn(() => {}),
		markFailed: jest.fn(() => {}),
		setHealthy: (value: boolean) => {
			healthy = value;
		},
	};
};
