ALTER TABLE "agent_profiles" ALTER COLUMN "operating_mode" SET DEFAULT 'AUTONOMOUS';--> statement-breakpoint
ALTER TABLE "agent_missions" ADD COLUMN "working_memory" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_missions" ADD COLUMN "iteration" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_missions" ADD COLUMN "maximum_iterations" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_missions" ADD COLUMN "replan_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_facts" ADD COLUMN "mission_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "mission_id" uuid;--> statement-breakpoint
ALTER TABLE "qualification_results" ADD COLUMN "mission_id" uuid;--> statement-breakpoint
ALTER TABLE "qualification_results" ADD COLUMN "recommended_action" text;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "mission_id" uuid;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "priority" text DEFAULT 'MEDIUM' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "mission_id" uuid;