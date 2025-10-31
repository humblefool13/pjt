// Script to initialize the first admin user
// Run with: node scripts/init-admin.js

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const DATA_DIR = path.join(__dirname, "../data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

async function initAdmin() {
  const readline = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (query) =>
    new Promise((resolve) => readline.question(query, resolve));

  console.log("=== Initialize Admin User ===\n");

  const name = await question("Enter admin name: ");
  const email = await question("Enter admin email: ");
  const password = await question("Enter admin password: ");

  readline.close();

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Check if users file exists
  let users = [];
  if (fs.existsSync(USERS_FILE)) {
    users = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
  }

  // Check if admin already exists
  const existingAdmin = users.find((u) => u.email === email);
  if (existingAdmin) {
    console.log("\n❌ Admin user with this email already exists!");
    process.exit(1);
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);

  // Create admin user
  const admin = {
    id: Date.now().toString(),
    name,
    email,
    passwordHash,
    isAdmin: true,
    createdAt: new Date().toISOString(),
  };

  users.push(admin);
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

  console.log("\n✅ Admin user created successfully!");
  console.log(`   Email: ${email}`);
  console.log(`   You can now login at http://localhost:3000/admin/login\n`);
}

initAdmin().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
