ALTER TABLE "agent_missions" ADD COLUMN "parent_mission_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_missions" ADD COLUMN "root_mission_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_missions" ADD COLUMN "continuation_depth" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_missions" ADD COLUMN "maximum_continuations" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_missions" ADD COLUMN "auto_continue" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "agent_missions_workspace_root_idx" ON "agent_missions" USING btree ("workspace_id","root_mission_id","continuation_depth");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_missions_parent_unique" ON "agent_missions" USING btree ("workspace_id","parent_mission_id") WHERE "parent_mission_id" IS NOT NULL;