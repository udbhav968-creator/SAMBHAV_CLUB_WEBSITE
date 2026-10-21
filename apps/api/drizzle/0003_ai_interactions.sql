CREATE TABLE "ai_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"mode" text NOT NULL,
	"model" text,
	"prompt_version" text,
	"prompt_hash" text,
	"page" text,
	"question" text,
	"answer" text,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"navigated_to" text,
	"rounds" smallint DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"latency_ms" integer NOT NULL,
	"first_token_ms" integer,
	"stop_reason" text,
	"error" text,
	"rating" smallint,
	"feedback_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_created_idx" ON "ai_interactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ai_rating_idx" ON "ai_interactions" USING btree ("rating");