// Connection check. Prints status only, never the connection string.
const fs = require("fs");
const { Client } = require("pg");
const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const raw = env.DATABASE_URL || "";
if (raw.includes("[YOUR-PASSWORD]")) { console.log("PLACEHOLDER still present"); process.exit(1); }
const u = new URL(raw.replace(/^postgres(ql)?:/, "http:"));
console.log("host kind:", u.hostname.startsWith("db.") ? "direct" : u.hostname.includes("pooler") ? "pooler" : "other", "| port", u.port, "| user has project ref:", u.username.includes("."));
const c = new Client({ connectionString: raw, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 });
c.connect()
  .then(() => c.query("select current_user as u, version() as v"))
  .then((r) => { console.log("CONNECTED as", r.rows[0].u, "|", r.rows[0].v.slice(0, 22)); return c.end(); })
  .catch((e) => { console.log("FAILED", e.code || "", String(e.message).replace(/postgres(ql)?:\/\/\S+/g, "<url>")); process.exit(1); });
