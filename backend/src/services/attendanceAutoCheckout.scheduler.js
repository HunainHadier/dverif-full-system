import { pool } from "../config/db.js";

export async function autoCheckoutOpenAttendance() {
  const [result] = await pool.query(
    `UPDATE attendance_records
        SET check_out_at=DATE_ADD(\`date\`, INTERVAL 1 DAY),
            status='checked_out'
      WHERE \`date\` < CURDATE()
        AND check_in_at IS NOT NULL
        AND check_out_at IS NULL
        AND status='checked_in'`,
  );
  return result.affectedRows;
}
