ALTER TABLE "agent_missions" ADD COLUMN "plan" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_missions" ADD COLUMN "result" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_missions" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "agent_missions" ADD COLUMN "target_account_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_missions" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "agent_missions" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "agent_missions" ADD COLUMN "queued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "rationale" text;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "evidence_urls" jsonb DEFAULT '[]'::jsonb NOT NULL;