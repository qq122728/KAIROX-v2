import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const dbPath = process.env.PERP_SIM_DB_PATH
  ? path.resolve(process.env.PERP_SIM_DB_PATH)
  : path.join(process.cwd(), "data", "perp-lab.sqlite");

const email = process.argv[2] || "test@test.com";
const amount = Number(process.argv[3] || 10000);

const db = new DatabaseSync(dbPath);
const user = db.prepare("SELECT id FROM users WHERE lower(email) = lower(?)").get(email);
if (!user) {
  console.error(`User not found: ${email}`);
  process.exit(1);
}
const userId = user.id;

db.exec("BEGIN");
try {
  db.prepare("INSERT INTO user_assets (user_id, asset, balance, locked) VALUES (?, 'USDC', 0, 0) ON CONFLICT(user_id, asset) DO NOTHING").run(userId);
  db.prepare("UPDATE user_assets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND asset = 'USDC'").run(amount, userId);
  db.prepare("UPDATE users SET balance = (SELECT balance FROM user_assets WHERE user_id = ? AND asset = 'USDC') WHERE id = ?").run(userId, userId);
  db.prepare("INSERT INTO asset_transactions (user_id, asset, type, amount, status, note) VALUES (?, 'USDC', 'admin_adjust', ?, 'completed', 'manual test credit')").run(userId, amount);
  db.exec("COMMIT");
} catch (err) {
  db.exec("ROLLBACK");
  console.error(err);
  process.exit(1);
}

const after = db.prepare("SELECT balance, locked FROM user_assets WHERE user_id = ? AND asset = 'USDC'").get(userId);
console.log(`✓ Credited ${amount} USDC to ${email} (user_id=${userId})`);
console.log(`  Balance: ${after.balance} USDC  /  Locked: ${after.locked} USDC`);
db.close();
