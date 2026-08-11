import { describe, expect, it } from "bun:test";
import { FullSubjectGateEdgeConfigSchema } from "@/internal/misc/fullSubjectGateEdgeConfig/fullSubjectGateEdgeConfigSchemas.js";

describe("FullSubjectGateEdgeConfigSchema defaults", () => {
	it("parses {} (missing S3 file) into a fully working config, nested objects included", () => {
		const config = FullSubjectGateEdgeConfigSchema.parse({});

		expect(config.per_customer_limit).toBe(200);
		expect(config.per_org_limit).toBe(500);
		expect(config.max_wait_ms).toBe(2_000);
		expect(config.per_customer_pending_max).toBe(500);
		expect(config.per_org_pending_max).toBe(1_000);
		expect(config.fleet_process_count).toBe(1);

		expect(config.replica_lane).toEqual({
			per_customer_limit: 540,
			per_org_limit: 810,
			per_customer_pending_max: 1_500,
			per_org_pending_max: 3_000,
		});
		expect(config.read_split).toEqual({ replica_share: 0 });
		expect(config.primary_hydration_hedge).toEqual({
			enabled: true,
			hedge_after_ms: 1_000,
			max_in_flight_per_process: 1,
		});
	});

	it("fills partial primary hydration hedge config and validates its bounds", () => {
		const config = FullSubjectGateEdgeConfigSchema.parse({
			primary_hydration_hedge: { hedge_after_ms: 750 },
		});
		expect(config.primary_hydration_hedge).toEqual({
			enabled: true,
			hedge_after_ms: 750,
			max_in_flight_per_process: 1,
		});

		for (const hedge_after_ms of [499, 1_501]) {
			expect(
				FullSubjectGateEdgeConfigSchema.safeParse({
					primary_hydration_hedge: { hedge_after_ms },
				}).success,
			).toBe(false);
		}
	});

	it("fills unspecified nested fields with defaults when only some are set", () => {
		const config = FullSubjectGateEdgeConfigSchema.parse({
			replica_lane: { per_customer_limit: 100 },
		});
		expect(config.replica_lane.per_customer_limit).toBe(100);
		expect(config.replica_lane.per_org_limit).toBe(810);
		expect(config.replica_lane.per_customer_pending_max).toBe(1_500);
		expect(config.replica_lane.per_org_pending_max).toBe(3_000);
	});

	it("accepts replica_share across its full [0, 1] range", () => {
		for (const replica_share of [0, 0.25, 0.5, 1]) {
			const result = FullSubjectGateEdgeConfigSchema.safeParse({
				read_split: { replica_share },
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.read_split.replica_share).toBe(replica_share);
			}
		}
	});

	it("rejects replica_share outside [0, 1]", () => {
		for (const replica_share of [-0.1, 1.1, 2]) {
			const result = FullSubjectGateEdgeConfigSchema.safeParse({
				read_split: { replica_share },
			});
			expect(result.success).toBe(false);
		}
	});
});
