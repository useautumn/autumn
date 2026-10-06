ALTER TABLE "runs" ADD COLUMN "is_baseline" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "new_failures" integer;--> statement-breakpoint
CREATE INDEX "runs_baseline_idx" ON "runs" USING btree ("is_baseline","finished_at");--> statement-breakpoint
-- Backfill: scheduled dev baselines, plus full-suite dev runs whose sha was the newest dev sha twd had seen when they were created.
UPDATE "runs" r SET "is_baseline" = true
WHERE r.branch = 'dev' AND r.repeat = 1 AND (
	r.purpose = 'baseline' OR (
		coalesce(r.selection->>'grep', '') = ''
		AND (
			r.selection->'groups' ? 'all'
			OR r.file_count >= (
				SELECT b.file_count FROM "runs" b
				WHERE b.purpose = 'baseline' AND b.branch = 'dev' AND b.file_count IS NOT NULL
				ORDER BY abs(extract(epoch FROM b.created_at - r.created_at)) LIMIT 1
			)
		)
		AND r.sha = (
			SELECT seen.sha FROM (
				SELECT w.sha, w.created_at FROM "warm_images" w WHERE w.branch = 'dev'
				UNION ALL
				SELECT d.sha, d.created_at FROM "runs" d WHERE d.branch = 'dev' AND d.pinned_sha = false
			) seen
			WHERE seen.created_at <= r.created_at
			ORDER BY seen.created_at DESC LIMIT 1
		)
	)
);--> statement-breakpoint
-- Backfill: files failing in each finished run that were not failing in the baseline finished before it.
UPDATE "runs" r SET "new_failures" = CASE WHEN r.failed = 0 THEN 0 ELSE (
	SELECT CASE WHEN prev.id IS NULL THEN NULL ELSE (
		SELECT count(*)::int FROM (
			SELECT DISTINCT ON (t.file) t.file, t.status FROM "test_results" t
			WHERE t.run_id = r.id ORDER BY t.file, t.attempt DESC, t.created_at DESC
		) cur
		WHERE cur.status IN ('failed', 'crashed', 'timed_out')
		AND coalesce((
			SELECT p.status FROM "test_results" p
			WHERE p.run_id = prev.id AND p.file = cur.file
			ORDER BY p.attempt DESC, p.created_at DESC LIMIT 1
		), 'passed') NOT IN ('failed', 'crashed', 'timed_out')
	) END
	FROM (
		SELECT (
			SELECT b.id FROM "runs" b
			WHERE b.is_baseline AND b.status IN ('passed', 'failed') AND b.id <> r.id
				AND b.finished_at < r.finished_at
			ORDER BY b.finished_at DESC LIMIT 1
		) AS id
	) prev
) END
WHERE r.repeat = 1 AND r.status IN ('passed', 'failed') AND r.finished_at IS NOT NULL;
