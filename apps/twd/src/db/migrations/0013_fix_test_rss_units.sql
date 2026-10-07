-- Bun 1.4 reports maxRSS in bytes; it was read as KiB, so test RSS was stored 1024x too large.
UPDATE "file_profiles" SET "test_peak_mib" = "test_peak_mib" / 1024 WHERE "test_peak_mib" > 65536;--> statement-breakpoint
UPDATE "file_run_stats" SET "stats" = jsonb_set("stats", '{mem,testProcessPeakMib}', to_jsonb(round(("stats"->'mem'->>'testProcessPeakMib')::numeric / 1024)))
WHERE ("stats"->'mem'->>'testProcessPeakMib')::numeric > 65536;
