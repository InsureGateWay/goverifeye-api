-- Platform admin seed for Supabase SQL Editor (idempotent).
-- Credentials after run: admin.demo@goverifeye.test / Admin123!

WITH org AS (
  INSERT INTO organizations (
    id,
    "companyName",
    "registrationNumber",
    industry,
    country,
    website,
    administrator,
    address,
    documents,
    status,
    "createdAt",
    "updatedAt",
    version
  )
  SELECT
    gen_random_uuid(),
    'goVerifEye Platform Ops',
    'PLATFORM-OPS-0001',
    'Technology',
    'Nigeria',
    'https://goverifeye.com',
    '{"firstName":"Platform","lastName":"Admin","email":"admin.demo@goverifeye.test","phone":"+2348000000001"}'::json,
    '{"line1":"1 Platform Way","city":"Lagos","state":"Lagos","country":"Nigeria","postalCode":"100001"}'::json,
    '[]'::json,
    'approved',
    NOW(),
    NOW(),
    1
  WHERE NOT EXISTS (
    SELECT 1 FROM organizations WHERE "companyName" = 'goVerifEye Platform Ops'
  )
  RETURNING id
),
org_id AS (
  SELECT id FROM org
  UNION ALL
  SELECT id FROM organizations WHERE "companyName" = 'goVerifEye Platform Ops' LIMIT 1
)
INSERT INTO users (
  id,
  email,
  "passwordHash",
  "firstName",
  "lastName",
  "organizationId",
  role,
  "isActive",
  "createdAt",
  "updatedAt",
  version
)
SELECT
  gen_random_uuid(),
  'admin.demo@goverifeye.test',
  '$argon2id$v=19$m=65536,t=3,p=4$6HTzWutzcn0A26lK5kL19A$AOaMWNgKtU3cyuvVDut2mggjCWjJsHWxXYymrqJa/qE',
  'Platform',
  'Admin',
  org_id.id,
  'platform_admin',
  true,
  NOW(),
  NOW(),
  1
FROM org_id
ON CONFLICT (email) DO UPDATE SET
  "passwordHash" = EXCLUDED."passwordHash",
  "firstName" = EXCLUDED."firstName",
  "lastName" = EXCLUDED."lastName",
  "organizationId" = EXCLUDED."organizationId",
  role = EXCLUDED.role,
  "isActive" = EXCLUDED."isActive",
  "updatedAt" = NOW();
