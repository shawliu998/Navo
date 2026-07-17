ALTER TABLE "agent_missions" ADD COLUMN "director_tick_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD COLUMN "director_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD COLUMN "director_interval_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD COLUMN "director_cooldown_minutes" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD COLUMN "director_max_active_missions" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD COLUMN "director_daily_mission_limit" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD COLUMN "last_director_decision_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD COLUMN "next_director_tick_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD COLUMN "last_director_decision" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_missions_director_tick_unique" ON "agent_missions" USING btree ("workspace_id","director_tick_id") WHERE "director_tick_id" IS NOT NULL;--> statement-breakpoint
UPDATE "agent_profiles" SET "director_enabled" = true WHERE "workspace_id" = '00000000-0000-4000-8000-000000000001';
