CREATE TABLE `activities` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text,
	`description` text,
	`color` text,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activities_scope` ON `activities` (`company_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `activities_name_uniq` ON `activities` (`company_id`,`name`);--> statement-breakpoint
CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL,
	`user_id` text,
	`company_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`summary` text NOT NULL,
	`changes` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_company_at_idx` ON `audit_log` (`company_id`,`at`);--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `catalog_item_taxes` (
	`company_id` text NOT NULL,
	`catalog_item_id` text NOT NULL,
	`tax_id` text NOT NULL,
	PRIMARY KEY(`catalog_item_id`, `tax_id`),
	FOREIGN KEY (`company_id`,`catalog_item_id`) REFERENCES `catalog_items`(`company_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`,`tax_id`) REFERENCES `taxes`(`company_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `catalog_items` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`activity_id` text,
	`kind` text NOT NULL,
	`sku` text,
	`name` text NOT NULL,
	`description` text,
	`category` text,
	`unit` text DEFAULT 'unit' NOT NULL,
	`unit_price_minor` integer DEFAULT 0 NOT NULL,
	`currency` text NOT NULL,
	`price_includes_tax` integer DEFAULT false NOT NULL,
	`tax_treatment` text DEFAULT 'taxable' NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`currency`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`,`activity_id`) REFERENCES `activities`(`company_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "catalog_price_chk" CHECK("catalog_items"."unit_price_minor" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_scope` ON `catalog_items` (`company_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_sku_uniq` ON `catalog_items` (`company_id`,`sku`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`contact_name` text,
	`address_line1` text,
	`address_line2` text,
	`city` text,
	`region` text,
	`postal_code` text,
	`country` text,
	`phone` text,
	`email` text,
	`tax_ids` text DEFAULT '[]' NOT NULL,
	`tax_exempt` integer DEFAULT false NOT NULL,
	`exemption_ref` text,
	`preferred_locale` text,
	`preferred_currency` text,
	`notes` text,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`preferred_currency`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `clients_company_name_idx` ON `clients` (`company_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `clients_scope` ON `clients` (`company_id`,`id`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`legal_name` text NOT NULL,
	`trade_name` text,
	`logo_file_id` text,
	`address_line1` text,
	`address_line2` text,
	`city` text,
	`region` text,
	`postal_code` text,
	`country` text,
	`phone` text,
	`email` text,
	`website` text,
	`legal_ids` text DEFAULT '[]' NOT NULL,
	`default_currency` text NOT NULL,
	`default_locale` text DEFAULT 'fr' NOT NULL,
	`payment_terms_days` integer DEFAULT 30 NOT NULL,
	`quote_validity_days` integer DEFAULT 30 NOT NULL,
	`prices_include_tax` integer DEFAULT false NOT NULL,
	`tax_rounding` text DEFAULT 'per_document' NOT NULL,
	`bank_details` text,
	`default_terms` text,
	`legal_footer` text,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`default_currency`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `currencies` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`symbol` text NOT NULL,
	`minor_units` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "currencies_minor_chk" CHECK("currencies"."minor_units" BETWEEN 0 AND 4)
);
--> statement-breakpoint
CREATE TABLE `exchange_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`base_code` text NOT NULL,
	`quote_code` text NOT NULL,
	`rate` text NOT NULL,
	`effective_date` text NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`base_code`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quote_code`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "exchange_rates_distinct_chk" CHECK("exchange_rates"."base_code" <> "exchange_rates"."quote_code")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exchange_rates_uniq` ON `exchange_rates` (`base_code`,`quote_code`,`effective_date`);--> statement-breakpoint
CREATE TABLE `invoice_line_taxes` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`line_id` text NOT NULL,
	`tax_id` text,
	`name` text NOT NULL,
	`rate_ppm` integer NOT NULL,
	`is_compound` integer NOT NULL,
	`registration_number` text,
	`base_minor` integer NOT NULL,
	`amount_minor` integer NOT NULL,
	FOREIGN KEY (`company_id`,`line_id`) REFERENCES `invoice_lines`(`company_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ilt_line_idx` ON `invoice_line_taxes` (`line_id`);--> statement-breakpoint
CREATE TABLE `invoice_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`position` integer NOT NULL,
	`catalog_item_id` text,
	`kind` text DEFAULT 'custom' NOT NULL,
	`sku` text,
	`name` text NOT NULL,
	`description` text,
	`unit` text,
	`quantity_milli` integer NOT NULL,
	`unit_price_minor` integer NOT NULL,
	`discount_type` text,
	`discount_value` integer,
	`tax_treatment` text NOT NULL,
	`gross_minor` integer DEFAULT 0 NOT NULL,
	`discount_minor` integer DEFAULT 0 NOT NULL,
	`net_minor` integer DEFAULT 0 NOT NULL,
	`tax_minor` integer DEFAULT 0 NOT NULL,
	`total_minor` integer DEFAULT 0 NOT NULL,
	`invoice_id` text NOT NULL,
	FOREIGN KEY (`company_id`,`invoice_id`) REFERENCES `invoices`(`company_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `invoice_lines_invoice_idx` ON `invoice_lines` (`invoice_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoice_lines_scope` ON `invoice_lines` (`company_id`,`id`);--> statement-breakpoint
CREATE TABLE `invoice_tax_totals` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`tax_id` text,
	`name` text NOT NULL,
	`rate_ppm` integer NOT NULL,
	`is_compound` integer NOT NULL,
	`registration_number` text,
	`base_minor` integer NOT NULL,
	`amount_minor` integer NOT NULL,
	FOREIGN KEY (`company_id`,`invoice_id`) REFERENCES `invoices`(`company_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `itt_invoice_idx` ON `invoice_tax_totals` (`invoice_id`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`client_id` text NOT NULL,
	`activity_id` text,
	`number` text,
	`currency` text NOT NULL,
	`locale` text DEFAULT 'fr' NOT NULL,
	`issue_date` text NOT NULL,
	`prices_include_tax` integer DEFAULT false NOT NULL,
	`tax_rounding` text NOT NULL,
	`doc_discount_type` text,
	`doc_discount_value` integer,
	`subtotal_minor` integer DEFAULT 0 NOT NULL,
	`discount_minor` integer DEFAULT 0 NOT NULL,
	`net_minor` integer DEFAULT 0 NOT NULL,
	`taxable_base_minor` integer DEFAULT 0 NOT NULL,
	`tax_total_minor` integer DEFAULT 0 NOT NULL,
	`total_minor` integer DEFAULT 0 NOT NULL,
	`terms` text,
	`notes` text,
	`client_snapshot` text,
	`company_snapshot` text,
	`duplicated_from_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`due_date` text NOT NULL,
	`payment_terms` text,
	`source_quote_id` text,
	`issued_at` text,
	`amount_paid_minor` integer DEFAULT 0 NOT NULL,
	`cancelled_at` text,
	`cancel_reason` text,
	`pdf_file_id` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`currency`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`,`client_id`) REFERENCES `clients`(`company_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`,`activity_id`) REFERENCES `activities`(`company_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`,`source_quote_id`) REFERENCES `quotes`(`company_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "invoices_status_chk" CHECK("invoices"."status" IN ('draft','issued','cancelled')),
	CONSTRAINT "invoices_paid_chk" CHECK("invoices"."amount_paid_minor" >= 0 AND "invoices"."amount_paid_minor" <= "invoices"."total_minor"),
	CONSTRAINT "invoices_number_chk" CHECK("invoices"."status" = 'draft' OR "invoices"."number" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_source_quote_id_unique` ON `invoices` (`source_quote_id`);--> statement-breakpoint
CREATE INDEX `invoices_company_status_idx` ON `invoices` (`company_id`,`status`);--> statement-breakpoint
CREATE INDEX `invoices_client_idx` ON `invoices` (`company_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `invoices_issue_date_idx` ON `invoices` (`company_id`,`issue_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_scope` ON `invoices` (`company_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_number_uniq` ON `invoices` (`company_id`,`number`);--> statement-breakpoint
CREATE TABLE `numbering_sequences` (
	`company_id` text NOT NULL,
	`doc_type` text NOT NULL,
	`pattern` text NOT NULL,
	`reset` text DEFAULT 'yearly' NOT NULL,
	`period_key` text NOT NULL,
	`next_value` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`company_id`, `doc_type`),
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "numbering_next_chk" CHECK("numbering_sequences"."next_value" >= 1)
);
--> statement-breakpoint
CREATE TABLE `org_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`default_locale` text DEFAULT 'fr' NOT NULL,
	`reporting_currency` text,
	`session_idle_minutes` integer DEFAULT 720 NOT NULL,
	`backup_retention_daily` integer DEFAULT 7 NOT NULL,
	`backup_retention_weekly` integer DEFAULT 4 NOT NULL,
	`backup_retention_monthly` integer DEFAULT 12 NOT NULL,
	`backup_export_dir` text,
	`updated_at` text NOT NULL,
	CONSTRAINT "org_settings_single_row" CHECK("org_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`client_id` text NOT NULL,
	`payment_date` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`method` text NOT NULL,
	`reference` text,
	`notes` text,
	`status` text DEFAULT 'recorded' NOT NULL,
	`voided_at` text,
	`void_reason` text,
	`idempotency_key` text,
	`created_by` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`currency`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`,`invoice_id`) REFERENCES `invoices`(`company_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`,`client_id`) REFERENCES `clients`(`company_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payments_amount_chk" CHECK("payments"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_idempotency_key_unique` ON `payments` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `payments_invoice_idx` ON `payments` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `payments_company_date_idx` ON `payments` (`company_id`,`payment_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `payments_scope` ON `payments` (`company_id`,`id`);--> statement-breakpoint
CREATE TABLE `quote_line_taxes` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`line_id` text NOT NULL,
	`tax_id` text,
	`name` text NOT NULL,
	`rate_ppm` integer NOT NULL,
	`is_compound` integer NOT NULL,
	`registration_number` text,
	`base_minor` integer NOT NULL,
	`amount_minor` integer NOT NULL,
	FOREIGN KEY (`company_id`,`line_id`) REFERENCES `quote_lines`(`company_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `qlt_line_idx` ON `quote_line_taxes` (`line_id`);--> statement-breakpoint
CREATE TABLE `quote_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`position` integer NOT NULL,
	`catalog_item_id` text,
	`kind` text DEFAULT 'custom' NOT NULL,
	`sku` text,
	`name` text NOT NULL,
	`description` text,
	`unit` text,
	`quantity_milli` integer NOT NULL,
	`unit_price_minor` integer NOT NULL,
	`discount_type` text,
	`discount_value` integer,
	`tax_treatment` text NOT NULL,
	`gross_minor` integer DEFAULT 0 NOT NULL,
	`discount_minor` integer DEFAULT 0 NOT NULL,
	`net_minor` integer DEFAULT 0 NOT NULL,
	`tax_minor` integer DEFAULT 0 NOT NULL,
	`total_minor` integer DEFAULT 0 NOT NULL,
	`quote_id` text NOT NULL,
	FOREIGN KEY (`company_id`,`quote_id`) REFERENCES `quotes`(`company_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `quote_lines_quote_idx` ON `quote_lines` (`quote_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `quote_lines_scope` ON `quote_lines` (`company_id`,`id`);--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`client_id` text NOT NULL,
	`activity_id` text,
	`number` text,
	`currency` text NOT NULL,
	`locale` text DEFAULT 'fr' NOT NULL,
	`issue_date` text NOT NULL,
	`prices_include_tax` integer DEFAULT false NOT NULL,
	`tax_rounding` text NOT NULL,
	`doc_discount_type` text,
	`doc_discount_value` integer,
	`subtotal_minor` integer DEFAULT 0 NOT NULL,
	`discount_minor` integer DEFAULT 0 NOT NULL,
	`net_minor` integer DEFAULT 0 NOT NULL,
	`taxable_base_minor` integer DEFAULT 0 NOT NULL,
	`tax_total_minor` integer DEFAULT 0 NOT NULL,
	`total_minor` integer DEFAULT 0 NOT NULL,
	`terms` text,
	`notes` text,
	`client_snapshot` text,
	`company_snapshot` text,
	`duplicated_from_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`valid_until` text NOT NULL,
	`sent_at` text,
	`decided_at` text,
	`cancelled_at` text,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`currency`) REFERENCES `currencies`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`,`client_id`) REFERENCES `clients`(`company_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`,`activity_id`) REFERENCES `activities`(`company_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "quotes_status_chk" CHECK("quotes"."status" IN ('draft','sent','accepted','refused','expired','cancelled')),
	CONSTRAINT "quotes_amounts_chk" CHECK("quotes"."total_minor" >= 0 AND "quotes"."tax_total_minor" >= 0)
);
--> statement-breakpoint
CREATE INDEX `quotes_company_status_idx` ON `quotes` (`company_id`,`status`);--> statement-breakpoint
CREATE INDEX `quotes_client_idx` ON `quotes` (`company_id`,`client_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `quotes_scope` ON `quotes` (`company_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `quotes_number_uniq` ON `quotes` (`company_id`,`number`);--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`payment_id` text NOT NULL,
	`number` text NOT NULL,
	`issue_date` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`balance_before_minor` integer NOT NULL,
	`balance_after_minor` integer NOT NULL,
	`is_full_payment` integer NOT NULL,
	`snapshot` text NOT NULL,
	`status` text DEFAULT 'valid' NOT NULL,
	`pdf_file_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`,`payment_id`) REFERENCES `payments`(`company_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_payment_id_unique` ON `receipts` (`payment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_number_uniq` ON `receipts` (`company_id`,`number`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`user_agent` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `stored_files` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text,
	`kind` text NOT NULL,
	`entity_type` text,
	`entity_id` text,
	`rel_path` text NOT NULL,
	`mime` text NOT NULL,
	`sha256` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stored_files_rel_path_unique` ON `stored_files` (`rel_path`);--> statement-breakpoint
CREATE INDEX `stored_files_entity_idx` ON `stored_files` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `taxes` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text,
	`rate_ppm` integer NOT NULL,
	`is_compound` integer DEFAULT false NOT NULL,
	`registration_number` text,
	`jurisdiction` text,
	`is_default` integer DEFAULT false NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "taxes_rate_chk" CHECK("taxes"."rate_ppm" BETWEEN 0 AND 1000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `taxes_scope` ON `taxes` (`company_id`,`id`);--> statement-breakpoint
CREATE TABLE `user_company_access` (
	`user_id` text NOT NULL,
	`company_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `company_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "uca_role_chk" CHECK("user_company_access"."role" IN ('admin','editor','viewer'))
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`locale` text DEFAULT 'fr' NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`password_changed_at` text NOT NULL,
	`last_login_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "users_role_chk" CHECK("users"."role" IN ('owner','member'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);