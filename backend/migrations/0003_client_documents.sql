CREATE TABLE `client_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`client_id` text NOT NULL,
	`kind` text DEFAULT 'imported_invoice' NOT NULL,
	`file_name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`number` text,
	`doc_date` text,
	`amount_minor` integer,
	`currency` text,
	`paid` integer,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`currency`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`,`client_id`) REFERENCES `clients`(`company_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "client_documents_amount_chk" CHECK("client_documents"."amount_minor" IS NULL OR "client_documents"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE INDEX `client_documents_client_idx` ON `client_documents` (`company_id`,`client_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `client_documents_scope` ON `client_documents` (`company_id`,`id`);