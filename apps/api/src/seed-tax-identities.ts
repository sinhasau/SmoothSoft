import './env';
import { Pool } from 'pg';
import { encryptSsn } from './security/staff-pii';

const pool = new Pool({ connectionString: process.env.DATABASE_MIGRATE_URL });

async function main() {
  const staff = await pool.query<{ id: string }>(`select ls.id from location_staff ls where ls.employment_status = 'active' order by ls.location_id, ls.id`);
  for (const [index, person] of staff.rows.entries()) {
    // Synthetic development-only SSNs. They are structurally valid but do not represent real people.
    const ssn = `12045${String(1001 + index).padStart(4, '0')}`;
    const ciphertext = encryptSsn(ssn, person.id);
    await pool.query(`insert into employee_tax_identities(location_staff_id, ssn_ciphertext, ssn_last_four) values ($1,$2,$3) on conflict (location_staff_id) do update set ssn_ciphertext=excluded.ssn_ciphertext, ssn_last_four=excluded.ssn_last_four, updated_at=now()`, [person.id, ciphertext, ssn.slice(-4)]);
  }
  console.log(`Seeded encrypted synthetic tax identities for ${staff.rowCount ?? staff.rows.length} active demo employees.`);
}

main().finally(() => pool.end());
