CREATE OR REPLACE FUNCTION twd_notify_change() RETURNS trigger AS $$
DECLARE
	row_id text;
BEGIN
	row_id := to_jsonb(COALESCE(NEW, OLD)) ->> TG_ARGV[0];
	PERFORM pg_notify('twd_changes', json_build_object('t', TG_TABLE_NAME, 'id', row_id)::text);
	RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER twd_runs_notify AFTER INSERT OR UPDATE OR DELETE ON runs FOR EACH ROW EXECUTE FUNCTION twd_notify_change('id');
--> statement-breakpoint
CREATE TRIGGER twd_jobs_notify AFTER INSERT OR UPDATE OR DELETE ON jobs FOR EACH ROW EXECUTE FUNCTION twd_notify_change('id');
--> statement-breakpoint
CREATE TRIGGER twd_stripe_accounts_notify AFTER INSERT OR UPDATE OR DELETE ON stripe_accounts FOR EACH ROW EXECUTE FUNCTION twd_notify_change('id');
--> statement-breakpoint
CREATE TRIGGER twd_reservations_notify AFTER INSERT OR UPDATE OR DELETE ON reservations FOR EACH ROW EXECUTE FUNCTION twd_notify_change('id');
--> statement-breakpoint
CREATE TRIGGER twd_stripe_keys_notify AFTER INSERT OR UPDATE OR DELETE ON stripe_keys FOR EACH ROW EXECUTE FUNCTION twd_notify_change('platform_account_id');
--> statement-breakpoint
CREATE TRIGGER twd_key_gate_notify AFTER INSERT OR UPDATE OR DELETE ON key_gate FOR EACH ROW EXECUTE FUNCTION twd_notify_change('id');
--> statement-breakpoint
CREATE TRIGGER twd_warm_images_notify AFTER INSERT OR UPDATE OR DELETE ON warm_images FOR EACH ROW EXECUTE FUNCTION twd_notify_change('sha');
