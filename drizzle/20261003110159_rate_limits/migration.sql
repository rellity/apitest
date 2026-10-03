CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY,
	"window_start" timestamp NOT NULL,
	"count" integer NOT NULL
);
