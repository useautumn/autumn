-- A cache: its JSON rows are dropped rather than recompressed in SQL, and cold loads read the rows until flushes rewrite them.
TRUNCATE "subject_snapshots";--> statement-breakpoint
ALTER TABLE "subject_snapshots" ALTER COLUMN "state" SET DATA TYPE bytea USING NULL;--> statement-breakpoint
ALTER TABLE "subject_snapshots" ALTER COLUMN "state" SET STORAGE MAIN;
