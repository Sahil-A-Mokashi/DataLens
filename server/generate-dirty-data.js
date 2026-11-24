const fs = require("fs");

const headers = [
  "customer_id",
  "full_name",
  "age",
  "email",
  "salary",
  "country",
  "signup_date",
  "orders_count",
  "satisfaction",
  "account_status",
  "phone",
  "credit_score"
];

const countries = ["Ireland", "India", "UK", "USA", "Germany", "France"];
const statuses = ["Active", "Inactive", "Pending", "Suspended"];
const firstNames = ["John", "Sarah", "Michael", "Priya", "Sahil", "Emma", "David", "Aarav"];
const lastNames = ["Smith", "Brown", "Mokashi", "Patel", "Wilson", "Murphy", "Sharma"];

const random = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = arr => arr[random(0, arr.length - 1)];

const csvEscape = value => {
  const s = String(value ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const rows = [headers.join(",")];

for (let i = 1; i <= 20000; i++) {
  let row = [
    `CUST${String(i).padStart(6, "0")}`,
    `${pick(firstNames)} ${pick(lastNames)}`,
    random(18, 75),
    `customer${i}@example.com`,
    random(20000, 120000),
    pick(countries),
    `${random(2020, 2026)}-${String(random(1, 12)).padStart(2, "0")}-${String(random(1, 28)).padStart(2, "0")}`,
    random(0, 50),
    random(1, 5),
    pick(statuses),
    `+353${random(800000000, 899999999)}`,
    random(300, 850)
  ];

  // Missing values
  if (i % 17 === 0) row[1] = "";
  if (i % 23 === 0) row[3] = "";
  if (i % 29 === 0) row[4] = "";
  if (i % 31 === 0) row[6] = "";
  if (i % 37 === 0) row[9] = "";

  // Invalid ages and mixed data types
  if (i % 101 === 0) row[2] = "unknown";
  if (i % 211 === 0) row[2] = -5;
  if (i % 307 === 0) row[2] = 250;

  // Invalid email addresses
  if (i % 43 === 0) row[3] = "not-an-email";
  if (i % 127 === 0) row[3] = "customer@@example";

  // Numeric outliers
  if (i % 151 === 0) row[4] = 99999999;
  if (i % 197 === 0) row[4] = -5000;
  if (i % 163 === 0) row[8] = 99;
  if (i % 173 === 0) row[11] = 9999;

  // Invalid dates and inconsistent formats
  if (i % 89 === 0) row[6] = "32/15/2025";
  if (i % 109 === 0) row[6] = "not-a-date";
  if (i % 139 === 0) row[6] = "15-04-2024";

  // Invalid categorical values
  if (i % 67 === 0) row[5] = "Atlantis";
  if (i % 83 === 0) row[9] = "UNKNOWN_STATUS";
  if (i % 97 === 0) row[9] = "active";

  // Invalid phone values
  if (i % 71 === 0) row[10] = "ABC123";
  if (i % 181 === 0) row[10] = "";

  // Duplicate rows
  if (i % 251 === 0 && i > 1) {
    row = rows[i - 1].split(",").map(v => v.replace(/^"|"$/g, ""));
    row[0] = `CUST${String(i).padStart(6, "0")}`;
  }

  rows.push(row.map(csvEscape).join(","));
}

fs.writeFileSync(
  "datalens_dirty_20000.csv",
  rows.join("\n"),
  "utf8"
);

console.log("CSV generated successfully!");
console.log("File: datalens_dirty_20000.csv");
console.log("Rows: 20,000");
console.log("Columns: 12");
console.log("Issues: Missing values, invalid types, outliers, duplicates, malformed dates, invalid emails and inconsistent categories.");
