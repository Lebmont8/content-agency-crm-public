BEGIN;

-- Audit records deliberately outlive their tenant and actor. Foreign keys
-- would either cascade-delete history or prevent an approved tenant deletion.
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_agencyId_actorId_fkey";
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_agencyId_fkey";
ALTER TABLE "AuditLog" ADD COLUMN "tenantDeletedAt" TIMESTAMP(3);

CREATE OR REPLACE FUNCTION audit_log_active_tenant_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Agency" WHERE "id" = NEW."agencyId") THEN
    RAISE EXCEPTION 'AuditLog agencyId must reference an active Agency'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "AuditLog_active_tenant"
BEFORE INSERT ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION audit_log_active_tenant_guard();

CREATE OR REPLACE FUNCTION audit_log_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- The Agency deletion trigger below is the only mutation path. It may only
  -- clear identifying metadata while preserving the audit fact itself.
  IF TG_OP = 'UPDATE'
     AND pg_trigger_depth() > 1
     AND NEW."id" IS NOT DISTINCT FROM OLD."id"
     AND NEW."agencyId" IS NOT DISTINCT FROM OLD."agencyId"
     AND NEW."action" IS NOT DISTINCT FROM OLD."action"
     AND NEW."entityType" IS NOT DISTINCT FROM OLD."entityType"
     AND NEW."createdAt" IS NOT DISTINCT FROM OLD."createdAt"
     AND NEW."actorId" IS NULL
     AND NEW."entityId" IS NULL
     AND NEW."before" IS NULL
     AND NEW."after" IS NULL
     AND NEW."tenantDeletedAt" IS NOT NULL
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'AuditLog is append-only; % is forbidden', TG_OP
    USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER "AuditLog_immutable"
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION audit_log_immutable_guard();

CREATE OR REPLACE FUNCTION anonymize_audit_log_before_agency_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "AuditLog"
     SET "actorId" = NULL,
         "entityId" = NULL,
         "before" = NULL,
         "after" = NULL,
         "tenantDeletedAt" = CURRENT_TIMESTAMP
   WHERE "agencyId" = OLD."id";
  RETURN OLD;
END;
$$;

CREATE TRIGGER "Agency_anonymize_audit"
BEFORE DELETE ON "Agency"
FOR EACH ROW EXECUTE FUNCTION anonymize_audit_log_before_agency_delete();

COMMIT;
