/* Excused against GenLayer Studio (chain 61999), with throwaway accounts. Deploys its own copy.
 *
 *   npm ci                                                   # genlayer-js 1.1.8 and viem 2.56.8, pinned by package-lock.json
 *   COMMIT=<sha> node tests/on_chain/smoke.mjs               # the whole run, about forty-five minutes
 *   COMMIT=<sha> RESUME=1 node tests/on_chain/smoke.mjs      # continue a run that was cut off, from the saved state
 *   STATE=/some/dir/run.json ...                             # the state file: keys, contract address, every step made
 *   FRESH=1 ...                                              # start over even though a saved run exists
 *
 * The validators read the notices from raw.githubusercontent.com, pinned to one commit, so the page every node
 * fetches is the same bytes. Push the repository first and pass that commit as COMMIT (40 hex characters). REPO
 * is "<owner>/<name>" on GitHub; when it is not set it is read from `git remote get-url origin`. The script
 * fetches the notices itself before it deploys anything, and stops if they are not there.
 *
 * Three accounts the script generates and funds itself play the whole story: SUPPLIER ships oak boards through
 * the Port of Saltmarsh and signs every agreement, BUYER accepts them, and STRANGER tries what only the others
 * may do. Every agreement carries the same clause: COVERED and OUTSIDE are asked of each cited notice, each in
 * both orders, by every validator.
 *
 * Phases:
 *   A  deploy. SUPPLIER names itself as the buyer, and sends a 0.05 GEN bond: both refused, the value back in the
 *      same transaction. SUPPLIER signs A1 (1 GEN), A2 (1 GEN) and A3 (0.5 GEN), due about thirty minutes ahead,
 *      A4 (0.5 GEN) and A5 (0.2 GEN), due two hours ahead; the evidence prefix is notices/ at COMMIT. STRANGER
 *      tries to accept A1 and is refused; BUYER accepts A1 to A4. SUPPLIER takes A5's bond back (never accepted)
 *      and states delivery of A4 before it is due (the bond back, closed on time). SUPPLIER deposits credit, and
 *      is refused an excuse for A1 before it is late; BUYER is refused a collect before it is due.
 *   B  the chain clock passes the due time of A1 to A3. SUPPLIER is refused a late statement of delivery for A3.
 *      One consensus round per excuse, every page read by the validators on the live web:
 *        SUPPLIER cites the repository's README for A1, outside the prefix: refused before anything is fetched
 *        STRANGER cites the storm notice for A1: refused, only the supplier may
 *        SUPPLIER: A1, port-closed-storm.html (closed 51 hours by order, for storm)   excused; the bond back
 *        SUPPLIER: A2, crane-strike.html (a dockworkers' strike, the port open)       not_excused; bond and fee to BUYER
 *        SUPPLIER: A3, port-closed-short.html (closed 6 hours, for fog)               not_excused, or unclear: then
 *                                                                                     BUYER collects once the window ends
 *   C  the deployed code is read back and compared with contracts/excused.py byte for byte; the views are checked
 *      against what the run did; SUPPLIER takes its credit back; the contract holds nothing; every account ends
 *      where the money says: BUYER up the bonds of A2 and A3 and two fees, SUPPLIER down the same.
 *
 * Every refusal is a signed transaction. Balances are read before and after every step that moves money.
 * Transactions are polled with eth_getTransactionByHash, never with views (gen_call is limited to 30 a minute
 * per client, shared with sim_fundAccount). A round the validators do not carry stores nothing; it is sent again
 * and both transactions are kept. Every id is read from the receipt of the call that made it. Every wait is by the
 * chain's own clock, read from the views. Every step is saved as it is made, so a run cut off by a closed laptop
 * continues with RESUME=1 without sending anything twice.
 */
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { generatePrivateKey } from "viem/accounts";
import { getAddress } from "viem";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const RPC = "https://studio.genlayer.com/api";
const EXPLORER = "https://explorer-studio.genlayer.com";
const STATE = process.env.STATE || join(tmpdir(), "excused-smoke-state.json");
const RECORD = process.env.RECORD || STATE.replace(/\.json$/, "") + "-record.json";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString().slice(11, 19);
const rpc = async (m, p) => {
  let last;
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) });
      const j = await r.json();
      if (j.error && (j.error.code === -32029 || r.status === 429)) { await sleep(((j.error.data?.retry_after_seconds) || 20) * 1000); continue; }
      if (j.error) { last = new Error(m + ": " + JSON.stringify(j.error).slice(0, 200)); await sleep(6000); continue; }
      return j.result;
    } catch (e) { last = e; await sleep(4000); }   // the connection itself failed, or the answer was not JSON
  }
  throw last;
};
let pass = 0, fail = 0;
const ok = (n, c, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  - " + d : ""}`); return !!c; };
const note = (s) => console.log(`      .. ${s}`);
const GEN = 10n ** 18n;
const tally = (v) => `${v.agree} agree, ${v.disagree} disagree, ${v.idle} idle`;
const sha = (text) => createHash("sha256").update(text).digest("hex");

// ---------- where the validators will read the notices ----------
const COMMIT = String(process.env.COMMIT || "").trim();
if (!/^[0-9a-f]{40}$/.test(COMMIT)) {
  console.log("COMMIT must be the 40-character commit the notices were pushed in: COMMIT=<sha> node tests/on_chain/smoke.mjs");
  process.exit(2);
}
let REPO = String(process.env.REPO || "").trim();
if (!REPO) {
  try {
    const origin = execSync("git remote get-url origin", { cwd: new URL("../..", import.meta.url), encoding: "utf8" }).trim();
    REPO = (origin.match(/github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/) || [])[1] || "";
  } catch (e) { REPO = ""; }
}
if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(REPO)) {
  console.log("REPO must be <owner>/<name> on GitHub (or set the git remote origin): REPO=<owner>/excused COMMIT=<sha> ...");
  process.exit(2);
}
const RAW_ROOT = `https://raw.githubusercontent.com/${REPO}/${COMMIT}/`;
const NOTICES = RAW_ROOT + "notices/";
if (NOTICES.length > 120) {
  console.log(`The evidence prefix ${NOTICES} must be at most 120 characters (the contract's own rule); use a shorter repository name.`);
  process.exit(2);
}
const PAGE = { storm: NOTICES + "port-closed-storm.html", strike: NOTICES + "crane-strike.html", short: NOTICES + "port-closed-short.html" };
const OUTSIDE = RAW_ROOT + "README.md";          // a real page of the same commit, but not below the prefix
const LOCAL = {};
for (const [name, address] of Object.entries(PAGE)) {
  LOCAL[name] = readFileSync(new URL("../../notices/" + address.slice(NOTICES.length), import.meta.url), "utf8");
  let there = "";
  try { const r = await fetch(address); there = r.ok ? await r.text() : ""; } catch (e) { there = ""; }
  if (there !== LOCAL[name]) {
    console.log(`${address}\ndoes not serve notices/${address.slice(NOTICES.length)} as it is in this checkout. Push the repository and pass that commit as COMMIT.`);
    process.exit(2);
  }
}
// what every validator should fingerprint: the first 32,000 characters with their tags removed (and the text after a
// script or style tag), then their spacing collapsed, at most 6,000; the contract's _visible and _page_text
const visible = (text) => {
  const pieces = text.slice(0, 32000).split("<");
  let out = pieces[0];
  for (const piece of pieces.slice(1)) {
    const close = piece.indexOf(">");
    if (close === -1) out += "<" + piece;
    else if (/^(script|style)/.test(piece.slice(0, 6).toLowerCase())) out += " ";
    else out += " " + piece.slice(close + 1);
  }
  return out;
};
const fpOf = (text) => sha(visible(text).slice(0, 32000).split(/\s+/).filter(Boolean).join(" ").slice(0, 6000)).slice(0, 16);

// ---------- state: keys, the contract address and every step already made survive a cut-off run ----------
if (existsSync(STATE) && !process.env.RESUME && !process.env.FRESH) {
  console.log(`A saved run exists at ${STATE}.\nRESUME=1 continues it; FRESH=1 starts over; STATE=<path> keeps another.`);
  process.exit(2);
}
const st = existsSync(STATE) && process.env.RESUME && !process.env.FRESH ? JSON.parse(readFileSync(STATE, "utf8")) : {};
st.keys = st.keys || {}; st.steps = st.steps || {}; st.views = st.views || {}; st.order = st.order || []; st.due = st.due || {};
st.commit = st.commit || COMMIT; st.repo = st.repo || REPO;
if (st.commit !== COMMIT) { console.log(`This saved run used commit ${st.commit}; continue it with that COMMIT, or start over with FRESH=1.`); process.exit(2); }
const save = () => {
  writeFileSync(STATE, JSON.stringify(st, null, 1));
  const { keys, ...shown } = st;       // the record carries no key
  writeFileSync(RECORD, JSON.stringify(shown, null, 1));
};
const ROLES = { supplier: "SUPPLIER, who ships the boards", buyer: "BUYER, who waits for them", stranger: "STRANGER" };
for (const k of Object.keys(ROLES)) st.keys[k] = st.keys[k] || generatePrivateKey();
const acct = {}, client = {};
for (const k of Object.keys(ROLES)) { acct[k] = createAccount(st.keys[k]); client[k] = createClient({ chain: studionet, account: acct[k] }); }
const rd = createClient({ chain: studionet });
st.accounts = Object.fromEntries(Object.keys(ROLES).map((k) => [k, getAddress(acct[k].address)]));
save();

const balance = async (a) => BigInt(await rpc("eth_getBalance", [a, "latest"]) || "0x0");
const nonceOf = async (a) => Number(BigInt(await rpc("eth_getTransactionCount", [a, "latest"]) || "0x0"));
const fundOnce = async (k, whole) => {
  st.funded = st.funded || {};
  if (st.funded[k]) return;
  await rpc("sim_fundAccount", { account_address: getAddress(acct[k].address), amount: whole * 1e18 });   // checksummed
  for (let i = 0; i < 20 && (await balance(acct[k].address)) === 0n; i++) await sleep(3000);
  st.funded[k] = String(await balance(acct[k].address)); save();
};

// ---------- transactions ----------
const errText = (e) => String(e?.details || e?.shortMessage || e?.cause?.message || e?.message || e);
// A request the network refused or never received is made again. When the failure is ambiguous the
// sender's nonce says whether the transaction landed after all, and its hash is read back, so nothing
// is ever sent twice.
const sendRaw = async (who, what, make) => {
  const addr = acct[who].address;
  for (let i = 0; ; i++) {
    const n0 = await nonceOf(addr);
    try { return await make(); } catch (e) {
      const text = errText(e);
      if (i >= 8) throw e;
      console.log(`      ${what} was not taken (${text.slice(0, 70)}); looking again in 20s`);
      await sleep(20000);
      if ((await nonceOf(addr)) > n0) {
        const list = await rpc("sim_getTransactionsForAddress", [addr]);
        const hit = (list || []).find((t) => String(t.from_address).toLowerCase() === addr.toLowerCase() && Number(t.nonce) === n0);
        if (hit?.hash) return hit.hash;
        throw new Error(what + " landed but its hash could not be read back");
      }
    }
  }
};
const countVotes = (t) => { let a = 0, d = 0, idl = 0; for (const k in (t.consensus_data?.votes || {})) { const v = t.consensus_data.votes[k]; if (v === "agree") a++; else if (v === "disagree") d++; else idl++; } return { agree: a, disagree: d, idle: idl }; };
const wait = async (tx) => {
  let stuck = 0;
  for (let i = 0; i < 900; i++) {
    await sleep(4000);
    const t = await rpc("eth_getTransactionByHash", [tx]);
    if (t?.status === "FINALIZED") {
      const lr = t.consensus_data?.leader_receipt, one = Array.isArray(lr) ? lr[0] : lr;
      let msg = "";
      try { msg = Buffer.from(one.result, "base64").toString("utf8").replace(/[^\x20-\x7e]/g, " ").trim(); } catch (e) {}
      const v = countVotes(t);
      return { tx, msg, exec: one?.execution_result || "", votes: v, applied: v.agree * 2 > v.agree + v.disagree + v.idle, address: t.data?.contract_address || t.to_address || "" };
    }
    // a round no majority carried is final as it stands once it has been left alone for ten minutes
    if (t?.status === "UNDETERMINED" && (stuck = stuck + 1) > 150) return { tx, msg: "UNDETERMINED", exec: "", votes: countVotes(t), applied: false, address: "" };
    if (t?.status === "CANCELED") return { tx, msg: "CANCELED", exec: "", votes: { agree: 0, disagree: 0, idle: 0 }, applied: false, address: "" };
    if (i > 0 && i % 75 === 0) console.log(`      [${stamp()}] still ${t?.status || "unknown"} after ${Math.round(i * 4 / 60)} minutes: ${tx}`);
  }
  return { tx, msg: "TIMEOUT", exec: "", votes: { agree: 0, disagree: 0, idle: 0 }, applied: false, address: "" };
};
const jsonOf = (msg) => { const b = String(msg).indexOf("{"); if (b === -1) return null; try { return JSON.parse(String(msg).slice(b)); } catch (e) { return null; } };
const settleBalance = async (a, before, want) => { for (let i = 0; i < 45; i++) { const b = await balance(a); if (b - before === want) return b; await sleep(4000); } return await balance(a); };

// One step of the run: a signed transaction, its tally, what it returned, and the balances it moved.
// opt.value is what is sent with it; opt.watch names the accounts whose balances are read before and
// after; opt.expect is the change each should show once every transfer has landed, a table or a
// function of what the call returned. A step already in the saved state is not sent again.
const call = async (id, who, fn, args = [], opt = {}) => {
  if (!st.steps[id]) { st.steps[id] = { id, who, fn, args: args.map(String), value: String(opt.value || 0n), tries: [] }; st.order.push(id); }
  const rec = st.steps[id];
  if (!rec.done) {
    const watch = opt.watch || [];
    if (!rec.before) { rec.before = {}; for (const k of watch) rec.before[k] = String(await balance(acct[k].address)); save(); }
    let r;
    for (;;) {
      if (!rec.pending) {
        rec.pending = await sendRaw(who, fn, () => client[who].writeContract({ address: st.contract, functionName: fn, args, ...(opt.value ? { value: opt.value } : {}) }));
        save();
      }
      r = await wait(rec.pending);
      rec.tries.push({ tx: r.tx, votes: r.votes, exec: r.exec, applied: r.applied, msg: r.msg, at: stamp() });
      rec.pending = null; save();
      console.log(`      [${stamp()}] ${who.toUpperCase()} ${fn}(${args.map((x) => String(x).slice(-30)).join(", ")})${opt.value ? " +" + Number(opt.value) / 1e18 + " GEN" : ""}  ${r.tx}  ${tally(r.votes)}  ${r.exec}`);
      if (r.msg === "TIMEOUT" || rec.tries.length >= 4) break;
      if (!r.applied) { console.log("      the validators did not carry that round (" + tally(r.votes) + "), so nothing was stored; sending it again"); continue; }
      break;
    }
    const expect = typeof opt.expect === "function" ? opt.expect(jsonOf(r.msg)) : opt.expect;
    rec.after = {}; rec.delta = {};
    for (const k of watch) {
      const before = BigInt(rec.before[k]);
      const want = expect && expect[k] !== undefined ? BigInt(expect[k]) : null;
      const now = want === null ? await balance(acct[k].address) : await settleBalance(acct[k].address, before, want);
      rec.after[k] = String(now); rec.delta[k] = String(now - before);
    }
    rec.done = true; save();
  }
  const last = rec.tries[rec.tries.length - 1];
  return { ...last, j: jsonOf(last.msg), tries: rec.tries, delta: rec.delta || {} };
};
const refused = (r, words) => r.exec === "ERROR" && r.msg.includes(words);
const moved = (r, k, want) => r.delta[k] === String(want);
const votes = (r) => r.tries.map((t) => tally(t.votes)).join(", then ");

const deploy = async (id, who, path) => {
  if (!st.steps[id]) { st.steps[id] = { id, who, fn: "deploy " + path.split("/").pop(), args: [], value: "0", tries: [] }; st.order.push(id); }
  const rec = st.steps[id];
  if (!rec.done) {
    const code = readFileSync(new URL(path, import.meta.url));
    for (;;) {
      if (!rec.pending) { rec.pending = await sendRaw(who, "deploy", () => client[who].deployContract({ code, args: [], leaderOnly: false })); save(); }
      const r = await wait(rec.pending);
      rec.tries.push({ tx: r.tx, votes: r.votes, exec: r.exec, applied: r.applied, msg: r.msg.slice(0, 300), at: stamp() });
      rec.address = r.address; rec.pending = null; save();
      console.log(`      [${stamp()}] ${who.toUpperCase()} deploy ${path.split("/").pop()}  ${r.tx}  ${tally(r.votes)}  ${r.exec}  ${r.address}`);
      if (r.applied || r.msg === "TIMEOUT" || rec.tries.length >= 3) break;
    }
    rec.done = true; save();
  }
  return rec.address;
};

// ---------- reads: paced, and made again on a 429 or on "Contract not found" instead of failing ----------
let lastRead = 0;
const read = async (fn, args = []) => {
  for (let i = 0; i < 30; i++) {
    const gap = 3500 - (Date.now() - lastRead);
    if (gap > 0) await sleep(gap);
    lastRead = Date.now();
    try { return JSON.parse(String(await rd.readContract({ address: st.contract, functionName: fn, args }))); } catch (e) {
      if (i === 29) return { error: "VIEW ERROR " + fn + ": " + errText(e).slice(0, 100) };
      await sleep(/rate|429|limit/i.test(errText(e)) ? 25000 : 10000);
    }
  }
};
// a view read once for a check is kept with the run, so a continued run checks what was seen then
const seen = async (id, fn, args = []) => { if (!st.views[id]) { st.views[id] = { fn, args, at: stamp(), out: await read(fn, args) }; save(); } return st.views[id].out; };
// wait, by the chain's own clock, until one of an agreement's instants has passed: the view reports the message
// clock as `now` (or -1 when a read carries none, and then this machine's clock stands in)
const untilPast = async (aid, field) => {
  for (;;) {
    const row = await read("agreement", [aid]);
    // a failed read says nothing about the clock: wait and read again, never take the instant as passed
    if (row.error || !(Number(row[field]) > 0)) { console.log(`      [${stamp()}] agreement(${aid}) could not be read (${String(row.error).slice(0, 60)}); reading again in 30 s`); await sleep(30000); continue; }
    const now = Number(row.now > 0 ? row.now : Math.floor(Date.now() / 1000));
    const left = Number(row[field] || 0) - now;
    if (left < -5) return;
    console.log(`      [${stamp()}] waiting ${left + 20} s, by the chain clock, for ${field} of ${aid} to pass`);
    await sleep((left + 20) * 1000);
  }
};

// ---------- the demonstration: one clause, the same notices as tests/test_pure.py ----------
const GOODS = "Forty pallets of kiln-dried oak boards, shipped through the Port of Saltmarsh";
const CLAUSE = "A closure of the Port of Saltmarsh ordered by the harbour authority, for storm or flood, lasting at least 24 hours, between 1 and 20 March 2027";
const COVERED = "Does the PAGE report an event of the kind the CLAUSE describes, within the dates and duration the CLAUSE sets? Answer yes, no or unclear.";
const OUTSIDE_Q = "Does the PAGE fail to report such an event, because it reports no event, a different kind of event, or one outside the clause's dates or shorter than its duration? Answer yes, no or unclear.";
const FEE = GEN / 100n;
const BOND = { A1: GEN, A2: GEN, A3: GEN / 2n, A4: GEN / 2n, A5: GEN / 5n };
const WINDOW = { A1: 3600, A2: 3600, A3: 1200, A4: 600, A5: 600 };
const LEAD = { A1: 1800, A2: 1800, A3: 1800, A4: 7200, A5: 7200 };    // seconds from the first run to each due time
const dueOf = (key) => { if (!st.due[key]) { st.due[key] = Math.floor(Date.now() / 1000) + LEAD[key]; save(); } return st.due[key]; };
const BUYER = () => st.accounts.buyer;

await fundOnce("supplier", 10); await fundOnce("buyer", 2); await fundOnce("stranger", 2);
if (!st.start) { st.start = {}; for (const k of Object.keys(ROLES)) st.start[k] = String(await balance(acct[k].address)); st.started = new Date().toISOString(); save(); }
console.log(`[${stamp()}] ${Object.keys(ROLES).map((k) => k.toUpperCase().padEnd(9) + " " + st.accounts[k]).join("\n           ")}\n           notices ${NOTICES}\n           state ${STATE}`);

// ================================================================ phase A
console.log(`\n[${stamp()}] ---- phase A: deploy, five agreements signed, four accepted, two closed before they are due`);
st.contract = st.contract || await deploy("deploy", "supplier", "../../contracts/excused.py");
save();
console.log(`      Excused at ${st.contract}`);
const self = await call("signSelf", "supplier", "sign", [st.accounts.supplier, GOODS, dueOf("A1"), CLAUSE, NOTICES, WINDOW.A1], { value: GEN, watch: ["supplier"], expect: { supplier: 0n } });
ok("SUPPLIER names itself as the buyer: refused, and the 1 GEN comes back in the same transaction", self.exec !== "ERROR" && self.j?.ok === false && String(self.j?.reason).includes("the buyer is somebody other than the supplier") && self.j?.returned === String(GEN) && moved(self, "supplier", 0n), `${votes(self)}  ${self.j?.reason}`);
const SHORT_BOND = GEN / 20n;
const small = await call("signSmall", "supplier", "sign", [BUYER(), GOODS, dueOf("A1"), CLAUSE, NOTICES, WINDOW.A1], { value: SHORT_BOND, watch: ["supplier"], expect: { supplier: 0n } });
ok("SUPPLIER sends a 0.05 GEN bond: refused, the least is 0.1 GEN, and the 0.05 GEN comes back", small.j?.ok === false && String(small.j?.reason).includes("the bond is the value sent") && small.j?.returned === String(SHORT_BOND) && moved(small, "supplier", 0n), `${votes(small)}  ${small.j?.reason}`);
const ag = {};
for (const key of ["A1", "A2", "A3", "A4", "A5"]) {
  const r = await call("sign" + key, "supplier", "sign", [BUYER(), GOODS, dueOf(key), CLAUSE, NOTICES, WINDOW[key]], { value: BOND[key], watch: ["supplier"], expect: { supplier: -BOND[key] } });
  ag[key] = r.j?.agreement || "";
  ok(`SUPPLIER signs ${ag[key]} with BUYER and locks a ${Number(BOND[key]) / 1e18} GEN bond; due ${dueOf(key)}, excuses until ${WINDOW[key]} s after`, r.j?.ok === true && /^A\d+$/.test(ag[key]) && r.j?.status === "offered" && r.j?.bond === String(BOND[key]) && r.j?.due === dueOf(key) && moved(r, "supplier", -BOND[key]), `${votes(r)}  ${r.msg.slice(0, 120)}`);
}
const strangerAccept = await call("acceptStranger", "stranger", "accept", [ag.A1]);
ok(`STRANGER may not accept ${ag.A1}`, refused(strangerAccept, "only the buyer ") && refused(strangerAccept, " may accept " + ag.A1), `${votes(strangerAccept)}  ${strangerAccept.msg.slice(0, 120)}`);
for (const key of ["A1", "A2", "A3", "A4"]) {
  const r = await call("accept" + key, "buyer", "accept", [ag[key]]);
  ok(`BUYER accepts ${ag[key]}`, r.j?.ok === true && r.j?.status === "active", `${votes(r)}  ${r.msg.slice(0, 100)}`);
}
const back5 = await call("withdrawA5", "supplier", "withdraw_bond", [ag.A5], { watch: ["supplier"], expect: { supplier: BOND.A5 } });
ok(`SUPPLIER takes back the 0.2 GEN bond of ${ag.A5}, which BUYER never accepted`, back5.j?.status === "withdrawn" && back5.j?.paid === String(BOND.A5) && moved(back5, "supplier", BOND.A5), `${votes(back5)}  ${back5.msg.slice(0, 100)}`);
const onTime = await call("deliverA4", "supplier", "mark_delivered", [ag.A4], { watch: ["supplier"], expect: { supplier: BOND.A4 } });
ok(`SUPPLIER states delivery of ${ag.A4} before it is due: the 0.5 GEN bond back, closed on time`, onTime.j?.status === "on_time" && onTime.j?.paid === String(BOND.A4) && moved(onTime, "supplier", BOND.A4), `${votes(onTime)}  ${onTime.msg.slice(0, 100)}`);
const CREDIT = 5n * FEE;
const dep = await call("deposit", "supplier", "deposit", [], { value: CREDIT, watch: ["supplier"], expect: { supplier: -CREDIT } });
ok("SUPPLIER deposits 0.05 GEN of excuse credit", dep.j?.ok === true && dep.j?.credit === String(CREDIT) && moved(dep, "supplier", -CREDIT), `${votes(dep)}  ${dep.msg.slice(0, 100)}`);
const early = await call("excuseEarly", "supplier", "excuse", [ag.A1, PAGE.storm]);
ok(`SUPPLIER may not cite a notice for ${ag.A1} before it is late: refused before anything is fetched`, refused(early, " and is not late; delivery is stated with mark_delivered before then"), `${votes(early)}  ${early.msg.slice(0, 140)}`);
const collectEarly = await call("collectEarly", "buyer", "collect", [ag.A1]);
ok(`BUYER may not collect ${ag.A1} before it is due`, refused(collectEarly, ag.A1 + " is not due until"), `${votes(collectEarly)}  ${collectEarly.msg.slice(0, 120)}`);

// ================================================================ phase B
console.log(`\n[${stamp()}] ---- phase B: late, and the notices read by the validators on the live web`);
for (const key of ["A1", "A2", "A3"]) await untilPast(ag[key], "due");
const lateDelivery = await call("deliverLateA3", "supplier", "mark_delivered", [ag.A3]);
ok(`SUPPLIER may not state delivery of ${ag.A3} after its due time`, refused(lateDelivery, "delivery after the due time is late"), `${votes(lateDelivery)}  ${lateDelivery.msg.slice(0, 140)}`);
const outside = await call("excuseOutside", "supplier", "excuse", [ag.A1, OUTSIDE], { watch: ["supplier", "buyer"], expect: { supplier: 0n, buyer: 0n } });
ok("SUPPLIER cites the repository's README, outside the prefix both parties named: refused before any fetch, no fee", refused(outside, "the page is not below " + NOTICES) && moved(outside, "buyer", 0n), `${votes(outside)}  ${outside.msg.slice(0, 160)}`);
const stranger = await call("excuseStranger", "stranger", "excuse", [ag.A1, PAGE.storm]);
ok(`STRANGER may not cite a notice for ${ag.A1}`, refused(stranger, "only the supplier of " + ag.A1 + " may cite a notice"), `${votes(stranger)}  ${stranger.msg.slice(0, 120)}`);
const x1 = await call("excuseA1", "supplier", "excuse", [ag.A1, PAGE.storm], { watch: ["supplier", "buyer"], expect: (j) => (j?.finding === "excused" ? { supplier: BOND.A1, buyer: 0n } : {}) });
ok(`every validator reads "port-closed-storm.html" (closed 51 hours by order, for storm): excused, ${ag.A1}'s 1 GEN back to SUPPLIER, the fee kept`, x1.applied && x1.j?.finding === "excused" && x1.j?.status === "excused" && x1.j?.fee_to === "supplier" && /^[0-9a-f]{16}$/.test(String(x1.j?.fp)) && moved(x1, "supplier", BOND.A1) && moved(x1, "buyer", 0n), `${votes(x1)}  ${JSON.stringify({ excuse: x1.j?.excuse, finding: x1.j?.finding, fp: x1.j?.fp, credit: x1.j?.credit })}`);
if (x1.j?.fp) note(`the stored fingerprint ${x1.j.fp}; this checkout's file collapsed gives ${fpOf(LOCAL.storm)}`);
const x2 = await call("excuseA2", "supplier", "excuse", [ag.A2, PAGE.strike], { watch: ["supplier", "buyer"], expect: (j) => (j?.finding === "not_excused" ? { supplier: 0n, buyer: BOND.A2 + FEE } : {}) });
ok(`every validator reads "crane-strike.html" (a dockworkers' strike, the port open): not_excused, ${ag.A2}'s 1 GEN and the fee to BUYER`, x2.applied && x2.j?.finding === "not_excused" && x2.j?.status === "penalised" && x2.j?.fee_to === "buyer" && moved(x2, "buyer", BOND.A2 + FEE), `${votes(x2)}  ${JSON.stringify({ excuse: x2.j?.excuse, finding: x2.j?.finding, fp: x2.j?.fp })}`);
if (x2.j?.fp) note(`the stored fingerprint ${x2.j.fp}; this checkout's file collapsed gives ${fpOf(LOCAL.strike)}`);
const x3 = await call("excuseA3", "supplier", "excuse", [ag.A3, PAGE.short], { watch: ["buyer"], expect: (j) => ({ buyer: j?.finding === "not_excused" ? BOND.A3 + FEE : FEE }) });
const a3 = x3.j?.finding;
ok(`every validator reads "port-closed-short.html" (closed 6 hours, for fog): ${a3}, and the fee goes to BUYER`, x3.applied && (a3 === "not_excused" || a3 === "unclear") && x3.j?.fee_to === "buyer" && moved(x3, "buyer", a3 === "not_excused" ? BOND.A3 + FEE : FEE), `${votes(x3)}  ${JSON.stringify({ excuse: x3.j?.excuse, finding: a3, fp: x3.j?.fp, status: x3.j?.status })}`);
if (a3 === "unclear") {
  const notYet = await call("collectA3Early", "buyer", "collect", [ag.A3]);
  ok(`BUYER may not collect ${ag.A3} while SUPPLIER may still cite one more notice`, refused(notYet, "may cite a notice until"), `${votes(notYet)}  ${notYet.msg.slice(0, 140)}`);
  await untilPast(ag.A3, "claim_until");
  const got = await call("collectA3", "buyer", "collect", [ag.A3], { watch: ["buyer"], expect: { buyer: BOND.A3 } });
  ok(`the window of ${ag.A3} closed with no excuse upheld: BUYER collects its 0.5 GEN`, got.j?.status === "collected" && moved(got, "buyer", BOND.A3), `${votes(got)}  ${got.msg.slice(0, 100)}`);
}

// ================================================================ phase C
console.log(`\n[${stamp()}] ---- phase C: the code read back, the views, the credit, the balances`);
{
  const file = readFileSync(new URL("../../contracts/excused.py", import.meta.url));
  const chain = Buffer.from(String(await rpc("gen_getContractCode", [st.contract])), "base64");
  st.code = { address: st.contract, bytes: chain.length, sha256: sha(chain), file_bytes: file.length, file_sha256: sha(file), identical: Buffer.compare(chain, file) === 0 };
  save();
  ok(`the code deployed at ${st.contract} is byte for byte contracts/excused.py`, st.code.identical, `${chain.length} bytes, sha256 ${st.code.sha256}`);
  const r1 = await seen("agreementA1", "agreement", [ag.A1]);
  ok(`agreement(${ag.A1}) reads excused by ${x1.j?.excuse}, the bond back to SUPPLIER`, r1.status === "excused" && r1.closed_by === x1.j?.excuse && r1.to_supplier === String(BOND.A1) && r1.to_buyer === "0" && r1.clause === CLAUSE && r1.source_prefix === NOTICES, JSON.stringify({ status: r1.status, closed_by: r1.closed_by }));
  const r2 = await seen("agreementA2", "agreement", [ag.A2]);
  ok(`agreement(${ag.A2}) reads penalised, the bond and one fee to BUYER`, r2.status === "penalised" && r2.to_buyer === String(BOND.A2) && r2.fees_to_buyer === String(FEE), JSON.stringify({ status: r2.status, to_buyer: r2.to_buyer }));
  const xs = await seen("excusesA1", "excuses_of", [ag.A1, 0, 20]);
  ok(`excuses_of(${ag.A1}) lists the one excuse with its page, finding, fingerprint and where the fee went`, xs.total === 1 && xs.rows?.[0]?.url === PAGE.storm && xs.rows?.[0]?.finding === "excused" && xs.rows?.[0]?.fee_to === "supplier" && xs.rows?.[0]?.fp === x1.j?.fp, JSON.stringify((xs.rows || []).map((r) => [r.excuse, r.finding, r.fee_to])));
  const mine = await seen("agreementsOfBuyer", "agreements_of", [st.accounts.buyer, 0, 20]);
  ok("agreements_of(BUYER) finds all five agreements as the buyer, with the address in any letter case", mine.total === 5 && (mine.rows || []).every((r) => r.role === "buyer"), JSON.stringify({ total: mine.total }));
  const stats = await seen("stats", "stats", []);
  ok("stats(): five agreements, one withdrawn, one on time, one excused, the rest penalised or collected, two refused payments returned", stats.held === "0" && stats.agreements === 5 && stats.withdrawn === 1 && stats.on_time === 1 && stats.excused === 1 && stats.penalised + stats.collected === 2 && stats.excuses === 3 && stats.fees === String(2n * FEE) && stats.refused_payments === 2, JSON.stringify(stats));
  const rules = await seen("rules", "rules", []);
  ok("rules() publishes the questions word for word, the comparison, the combine table and the limits", rules.excuse?.questions?.covered === COVERED && rules.excuse?.questions?.outside === OUTSIDE_Q && String(rules.excuse?.askings?.[1]).startsWith("2, blocks PAGE then CLAUSE: " + COVERED) && String(rules.compared).includes("exact equality") && rules.excuse?.combine?.excused === "COVERED yes in both orders and OUTSIDE no in both orders" && String(rules.limits?.[0]).includes("who controls it controls the excuse"), "");
  const back = CREDIT - 2n * FEE;
  const w = await call("withdrawCredit", "supplier", "withdraw", [], { watch: ["supplier"], expect: { supplier: back } });
  ok(`SUPPLIER takes its ${Number(back) / 1e18} GEN of credit back`, w.j?.withdrawn === String(back) && moved(w, "supplier", back), `${votes(w)}  ${w.msg.slice(0, 100)}`);
  ok("the contract's own balance is zero", (await balance(st.contract)) === 0n, String(await balance(st.contract)));
  st.end = {}; for (const k of Object.keys(ROLES)) st.end[k] = String(await balance(acct[k].address));
  st.ended = new Date().toISOString(); save();
  const net = (k) => BigInt(st.end[k]) - BigInt(st.start[k]);
  const owed = BOND.A2 + BOND.A3 + 2n * FEE;
  const want = { supplier: -owed, buyer: owed, stranger: 0n };
  ok("every account ends where the money says: BUYER up 1.52 GEN, SUPPLIER down 1.52 GEN, STRANGER unchanged", Object.keys(want).every((k) => net(k) === want[k]), Object.keys(want).map((k) => k.toUpperCase() + " " + Number(net(k)) / 1e18).join("  "));
}

st.checks = { pass, fail }; save();
console.log(`\n${pass} passed, ${fail} failed`);
console.log(`Excused: ${st.contract}  ${EXPLORER}/address/${st.contract}`);
console.log("transactions:", st.order.reduce((n, id) => n + st.steps[id].tries.length, 0), "in", st.order.length, "steps; sent a second time:", st.order.filter((id) => st.steps[id].tries.length > 1).join(", ") || "none");
for (const id of st.order) { const s = st.steps[id]; console.log(`${id.padEnd(19)} ${s.tries.map((t) => t.tx + " " + tally(t.votes) + " " + t.exec).join(" | ")}`); }
console.log("record:", RECORD);
process.exit(fail ? 1 : 0);
