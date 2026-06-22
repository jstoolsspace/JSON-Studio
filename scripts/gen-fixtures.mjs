// Generate benchmark/test fixtures for JSON Studio.
//
//   node scripts/gen-fixtures.mjs           # small + medium set
//   node scripts/gen-fixtures.mjs --huge    # also 100MB / 500MB / 1M array / 1M JSONL
//
// Files are written to ./fixtures (git-ignored). Open them in the app to test
// large-file behavior (Raw/Tree windowing, search, JSONL table, etc.).

import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve("fixtures");
fs.mkdirSync(OUT, { recursive: true });
const huge = process.argv.includes("--huge");

function record(i) {
  return {
    id: i,
    name: `user ${i}`,
    email: `user${i}@example.test`,
    active: i % 2 === 0,
    score: Number(((i % 1000) + i / 1e6).toFixed(4)),
    tags: ["alpha", "beta", i % 3 === 0 ? "gamma" : "delta"],
    profile: { age: 20 + (i % 50), city: `town-${i % 200}` },
    createdAt: new Date(1_700_000_000_000 + i * 1000).toISOString(),
  };
}

// Backpressure-safe write.
function write(ws, str) {
  return new Promise((resolve) => {
    if (ws.write(str)) resolve();
    else ws.once("drain", resolve);
  });
}

async function genJsonArray(file, targetBytes) {
  const ws = fs.createWriteStream(path.join(OUT, file));
  await write(ws, "[\n");
  let written = 2;
  let i = 0;
  while (written < targetBytes) {
    const chunk = (i > 0 ? ",\n" : "") + JSON.stringify(record(i));
    await write(ws, chunk);
    written += Buffer.byteLength(chunk);
    i++;
  }
  await write(ws, "\n]\n");
  await new Promise((r) => ws.end(r));
  console.log(`  ${file}  ~${(written / 1e6).toFixed(1)} MB, ${i} records`);
}

async function genJsonl(file, lines) {
  const ws = fs.createWriteStream(path.join(OUT, file));
  for (let i = 0; i < lines; i++) {
    await write(ws, JSON.stringify(record(i)) + "\n");
  }
  await new Promise((r) => ws.end(r));
  console.log(`  ${file}  ${lines} records`);
}

async function genNumberArray(file, n) {
  const ws = fs.createWriteStream(path.join(OUT, file));
  await write(ws, "[");
  for (let i = 0; i < n; i++) await write(ws, (i > 0 ? "," : "") + i);
  await write(ws, "]\n");
  await new Promise((r) => ws.end(r));
  console.log(`  ${file}  ${n} numbers`);
}

function genDeep(file, depth) {
  fs.writeFileSync(
    path.join(OUT, file),
    "[".repeat(depth) + '{"v":1}' + "]".repeat(depth) + "\n",
  );
  console.log(`  ${file}  depth ${depth}`);
}

function genBigNums(file) {
  // Hand-written so big integers / high-precision decimals stay verbatim.
  const text = `{
  "int64_max": 9223372036854775807,
  "huge_int": 123456789012345678901234567890,
  "neg_huge": -9999999999999999999999,
  "high_precision": 0.1234567890123456789,
  "exp": 1.7976931348623157e308,
  "tiny": 5e-324,
  "ordered_keys": { "2": "second", "1": "first", "10": "ten" }
}
`;
  fs.writeFileSync(path.join(OUT, file), text);
  console.log(`  ${file}`);
}

function genInvalid(file) {
  fs.writeFileSync(
    path.join(OUT, file),
    '{\n  "ok": 1,\n  "bad": ,\n  "trailing": [1, 2, ]\n}\n',
  );
  console.log(`  ${file}  (intentionally invalid)`);
}

console.log(`Writing fixtures to ${OUT}`);
genBigNums("bignums.json");
genInvalid("invalid.json");
genDeep("deep.json", 5000);
await genJsonArray("1mb.json", 1_000_000);
await genJsonArray("10mb.json", 10_000_000);
await genJsonl("100k.jsonl", 100_000);

if (huge) {
  console.log("Generating huge fixtures (this takes a while)…");
  await genJsonArray("100mb.json", 100_000_000);
  await genJsonArray("500mb.json", 500_000_000);
  await genNumberArray("array-1m.json", 1_000_000);
  await genJsonl("1m.jsonl", 1_000_000);
}

console.log("Done.");
