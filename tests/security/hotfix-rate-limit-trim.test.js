import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('Rate Limit SQL Hotfix Migration Specification', () => {
  const migrationPath = 'supabase/migrations/20261119120000_fix_contact_rate_limit_trim.sql';

  test('migration file exists and contains valid forward-only SQL', () => {
    assert.ok(fs.existsSync(migrationPath), 'Migration file must exist');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(sql.length > 500, 'Migration must not be empty');
  });

  test('replaces auth_util.check_and_increment_rate_limit with btrim fix', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(
      sql.includes('CREATE OR REPLACE FUNCTION auth_util.check_and_increment_rate_limit'),
      'Must use CREATE OR REPLACE FUNCTION on auth_util.check_and_increment_rate_limit'
    );
    assert.ok(
      sql.includes('pg_catalog.btrim(p_ip)'),
      'Must call pg_catalog.btrim(p_ip)'
    );

    // Strip SQL comments before checking that no active code calls pg_catalog.trim(
    const codeOnly = sql.replace(/--.*$/gm, '');
    assert.ok(
      !codeOnly.includes('pg_catalog.trim('),
      'Active SQL code must NOT call pg_catalog.trim('
    );
  });

  test('preserves SECURITY DEFINER, search_path, and schema qualification', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(sql.includes('SECURITY DEFINER'), 'Must remain SECURITY DEFINER');
    assert.ok(sql.includes("SET search_path = ''"), 'Must enforce empty search_path');
    assert.ok(sql.includes('auth_util.contact_rate_limits'), 'Must explicitly schema-qualify contact_rate_limits table');
    assert.ok(sql.includes('pg_catalog.clock_timestamp()'), 'Must schema-qualify clock_timestamp');
    assert.ok(sql.includes('pg_catalog.length('), 'Must schema-qualify length');
    assert.ok(sql.includes('pg_catalog.random()'), 'Must schema-qualify random');
  });

  test('preserves ownership and strict execution privileges', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(
      sql.includes('ALTER FUNCTION auth_util.check_and_increment_rate_limit(TEXT, INT, INT) OWNER TO postgres;'),
      'Must set owner to postgres'
    );
    assert.ok(
      sql.includes('REVOKE ALL ON FUNCTION auth_util.check_and_increment_rate_limit(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;'),
      'Must revoke from PUBLIC, anon, authenticated'
    );
    assert.ok(
      sql.includes('GRANT EXECUTE ON FUNCTION auth_util.check_and_increment_rate_limit(TEXT, INT, INT) TO service_role;'),
      'Must grant execute exclusively to service_role'
    );
    assert.ok(
      !sql.includes('TO anon') && !sql.includes('TO authenticated') && !sql.includes('TO PUBLIC'),
      'Must not grant any privilege to anon, authenticated, or PUBLIC'
    );
  });

  test('preserves input validation exceptions and algorithm semantics', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(sql.includes("RAISE EXCEPTION 'INVALID_ARGUMENT: p_ip must not be null or whitespace-only'"));
    assert.ok(sql.includes("RAISE EXCEPTION 'INVALID_ARGUMENT: p_ip exceeds maximum length of 128 characters'"));
    assert.ok(sql.includes("RAISE EXCEPTION 'INVALID_ARGUMENT: p_window_ms must be a positive integer not exceeding 86400000 (24 hours)'"));
    assert.ok(sql.includes("RAISE EXCEPTION 'INVALID_ARGUMENT: p_max_requests must be a positive integer not exceeding 1000'"));
    assert.ok(sql.includes("interval '24 hours'"));
    assert.ok(sql.includes('ON CONFLICT (ip) DO UPDATE'));
    assert.ok(sql.includes('RETURNING request_count INTO v_record'));
  });
});
