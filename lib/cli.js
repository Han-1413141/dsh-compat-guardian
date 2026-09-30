#!/usr/bin/env node

// src/cli.ts
import { parseArgs } from "node:util";
import { resolve as resolve4 } from "node:path";
import { createRequire as createRequire2 } from "node:module";

// src/rescue.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import { join as join2, resolve as resolve3 } from "node:path";

// shared/compatibility.ts
import semver2 from "semver";

// shared/validation.ts
import semver from "semver";
function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} \u5FC5\u987B\u662F\u5BF9\u8C61`);
  return value;
}
function string(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32`);
  return value;
}
function strings(value, label) {
  if (!Array.isArray(value) || !value.every((x) => typeof x === "string" && x.length > 0)) throw new Error(`${label} \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4`);
  return value;
}
function packageName(value) {
  if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(value) || value.length > 214) throw new Error(`\u65E0\u6548\u7684\u5305\u540D\uFF1A${value}`);
  return value;
}
function compatMetadata(value) {
  if (value === void 0) return {};
  const data = object(value, "dshCompat");
  const out = {};
  for (const key of ["capabilities", "services", "tools", "permissions", "platforms"]) {
    if (data[key] !== void 0) out[key] = strings(data[key], `dshCompat.${key}`);
  }
  if (data.dsh !== void 0) {
    out.dsh = string(data.dsh, "dshCompat.dsh");
    if (!semver.validRange(out.dsh)) throw new Error("dshCompat.dsh \u7248\u672C\u8303\u56F4\u65E0\u6548");
  }
  for (const key of ["requires", "conflicts"]) {
    if (data[key] === void 0) continue;
    out[key] = {};
    for (const [name, range] of Object.entries(object(data[key], key))) {
      packageName(name);
      const rule = string(range, `${key}.${name}`);
      if (!semver.validRange(rule)) throw new Error(`${key}.${name} \u7248\u672C\u8303\u56F4\u65E0\u6548`);
      out[key][name] = rule;
    }
  }
  if (data.priority !== void 0) {
    if (typeof data.priority !== "number" || !Number.isFinite(data.priority)) throw new Error("priority \u5FC5\u987B\u662F\u6709\u9650\u6570\u503C");
    out.priority = data.priority;
  }
  return out;
}

// shared/compatibility.ts
function matches(value, range) {
  return Boolean(semver2.valid(value) && range.trim() && semver2.validRange(range) && semver2.satisfies(value, range, { includePrerelease: true }));
}
function findingsFor(records, runtime, options) {
  const active = records.filter((x) => x.enabled);
  const byName = new Map(active.map((x) => [x.name, x]));
  const findings = [];
  const claims = /* @__PURE__ */ new Map();
  const add = (code, plugins, message, severity = "error") => {
    findings.push({ code, plugins, message, severity });
  };
  for (const plugin of active) {
    let meta;
    try {
      meta = compatMetadata(plugin.manifest.dshCompat);
      for (const field of ["dependencies", "peerDependencies"]) {
        if (plugin.manifest[field] !== void 0) {
          for (const [name, range] of Object.entries(object(plugin.manifest[field], field))) string(range, `${field}.${name}`);
        }
      }
      if (plugin.manifest.os !== void 0) strings(plugin.manifest.os, "os");
      if (plugin.manifest.engines !== void 0) {
        const engines = object(plugin.manifest.engines, "engines");
        if (engines.node !== void 0) string(engines.node, "engines.node");
      }
    } catch (error) {
      add("invalid-metadata", [plugin.name], String(error));
      continue;
    }
    const peers = plugin.manifest.peerDependencies ?? {};
    if (!peers || typeof peers !== "object" || Array.isArray(peers)) {
      add("invalid-metadata", [plugin.name], "peerDependencies \u5FC5\u987B\u662F\u5BF9\u8C61");
      continue;
    }
    const dshPeers = Object.entries(peers).filter(([name]) => name === "@deepseek-ai/dsh" || name.startsWith("@deepseek-ai/dsh-"));
    const ranges = [...dshPeers, ...meta.dsh ? [["dshCompat.dsh", meta.dsh]] : []];
    if (!ranges.length && !plugin.protected) add("unknown-compatibility", [plugin.name], `${plugin.name} \u672A\u58F0\u660E DSH \u7248\u672C\u8303\u56F4\uFF1B\u517C\u5BB9\u6027\u672A\u77E5`, "warning");
    for (const [name, range] of options.runtimeCompanions?.has(plugin.name) ? [] : ranges) {
      const normalized = typeof range === "string" && ["workspace:*", "workspace:^", "workspace:~"].includes(range) ? runtime : range;
      if (typeof normalized !== "string" || !matches(runtime, normalized)) {
        add("dsh-version", [plugin.name], `${plugin.name}@${plugin.version} \u8981\u6C42 ${name} ${String(range)}\uFF0C\u5F53\u524D DSH \u4E3A ${runtime}`);
      }
    }
    const sharedRuntime = /* @__PURE__ */ new Set(["@deepseek-ai/dsh-tools", "@deepseek-ai/dsh-agent", "@deepseek-ai/dsh-session", "@deepseek-ai/dsh-llm", "@deepseek-ai/dsh-sandbox-policy"]);
    for (const [name, range] of Object.entries(plugin.manifest.dependencies ?? {})) {
      if (!options.runtimeCompanions?.has(plugin.name) && sharedRuntime.has(name) && (typeof range !== "string" || !range.startsWith("workspace:") && !matches(runtime, range))) {
        add("embedded-runtime", [plugin.name], `${plugin.name} \u76F4\u63A5\u4F9D\u8D56 ${name} ${String(range)}\uFF0C\u4F1A\u5F15\u5165\u4E0E\u5BBF\u4E3B ${runtime} \u4E0D\u4E00\u81F4\u7684\u6838\u5FC3\u7EC4\u4EF6\uFF1B\u5E94\u7531\u7EF4\u62A4\u8005\u6539\u4E3A\u5339\u914D\u7684 peerDependencies`);
      }
    }
    if (plugin.manifest.engines?.node && !matches(options.nodeVersion ?? process.version, plugin.manifest.engines.node)) {
      add("node-version", [plugin.name], `${plugin.name} \u8981\u6C42 Node.js ${plugin.manifest.engines.node}`);
    }
    const platform = options.platform ?? process.platform;
    const os = plugin.manifest.os;
    if (os && (os.includes(`!${platform}`) || os.some((x) => !x.startsWith("!")) && !os.includes(platform)) || meta.platforms && !meta.platforms.includes(platform)) add("platform", [plugin.name], `${plugin.name} \u4E0D\u652F\u6301 ${platform}`);
    for (const [name, range] of Object.entries(meta.requires ?? {})) {
      const dependency = byName.get(name);
      if (!dependency) add("missing-dependency", [plugin.name], `${plugin.name} \u9700\u8981\u542F\u7528 ${name} ${range}`);
      else if (!matches(dependency.version, range)) add("dependency-version", [plugin.name], `${plugin.name} \u9700\u8981 ${name} ${range}\uFF0C\u5B9E\u9645\u4E3A ${dependency.version}`);
    }
    for (const [name, range] of Object.entries(peers)) {
      if (name === "@deepseek-ai/dsh" || name.startsWith("@deepseek-ai/dsh-") || typeof range !== "string") continue;
      const dependency = byName.get(name)?.version ?? options.dependencyVersions?.[name];
      if (dependency && !range.startsWith("workspace:") && !matches(dependency, range)) {
        add("dependency-version", [plugin.name], `${plugin.name} \u8981\u6C42 peer ${name} ${range}\uFF0C\u5B9E\u9645\u4E3A ${dependency}`);
      }
    }
    for (const [name, range] of Object.entries(meta.conflicts ?? {})) {
      const other = byName.get(name);
      if (other && other !== plugin && matches(other.version, range)) add("declared-conflict", [plugin.name, name], `${plugin.name} \u4E0E ${name}@${other.version} \u51B2\u7A81`);
    }
    if (plugin.loadError || plugin.state === "failed") add("load-failure", [plugin.name], plugin.loadError ?? `${plugin.name} \u7684\u8FD0\u884C\u5B9E\u4F8B\u52A0\u8F7D\u5931\u8D25`);
    for (const id of plugin.duplicateRowIds ?? []) add("duplicate-row", [plugin.name], `${plugin.name} \u91CD\u590D\u58F0\u660E\u9876\u5C42\u6761\u76EE ${id}`);
    for (const [kind, values] of [["row", plugin.rowIds], ["service", meta.services ?? []], ["tool", meta.tools ?? []]]) {
      for (const value of new Set(values)) {
        const key = `${kind}:${value}`;
        claims.set(key, [...claims.get(key) ?? [], plugin.name]);
      }
    }
  }
  for (const [claim, plugins] of claims) {
    if (plugins.length < 2) continue;
    const [kind, ...name] = claim.split(":");
    add(`duplicate-${kind}`, plugins, `${plugins.join("\u3001")} \u91CD\u590D\u63D0\u4F9B ${kind} ${name.join(":")}`);
  }
  return findings;
}
function checkCompatibility(records, runtimeVersion, options = {}) {
  if (!semver2.valid(runtimeVersion)) throw new Error(`\u65E0\u6548 DSH \u7248\u672C\uFF1A${runtimeVersion}`);
  const findings = findingsFor(records, runtimeVersion, options);
  const working = records.map((x) => ({ ...x }));
  const quarantine = [];
  for (let step = 0; step < records.length; step++) {
    const errors = findingsFor(working, runtimeVersion, options).filter((x) => x.severity === "error");
    const candidates = working.filter((x) => x.enabled && !x.protected && errors.some((f) => f.plugins.includes(x.name)));
    if (!candidates.length) break;
    candidates.sort((a, b) => Number(options.activePlugins?.has(a.name) ?? false) - Number(options.activePlugins?.has(b.name) ?? false) || (Number(a.manifest.dshCompat?.priority) || 0) - (Number(b.manifest.dshCompat?.priority) || 0) || working.indexOf(b) - working.indexOf(a));
    const candidate = candidates[0];
    candidate.enabled = false;
    quarantine.push(candidate.name);
  }
  return { runtimeVersion, findings, quarantine, unresolved: findingsFor(working, runtimeVersion, options).filter((x) => x.severity === "error") };
}

// shared/files.ts
import { open, readFile, mkdir, rename, rm, realpath, lstat } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { withFileLock } from "@deepseek-ai/dsh-atomic-write";
var digest = (value) => createHash("sha256").update(value).digest("hex");
async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
async function optionalText(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return void 0;
    throw error;
  }
}
async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, "wx", 384);
  try {
    await file.writeFile(content, "utf8");
    await file.sync();
    await file.close();
    await rename(temporary, path);
  } catch (error) {
    await file.close().catch(() => {
    });
    await rm(temporary, { force: true });
    throw error;
  }
}
var writeJson = (path, value) => atomicWrite(path, `${JSON.stringify(value, null, 2)}
`);
function within(root, target) {
  const absolute = resolve(target), rel = relative(resolve(root), absolute);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`\u8DEF\u5F84\u8D85\u51FA\u6307\u5B9A\u76EE\u5F55\uFF1A${target}`);
  return absolute;
}
async function withLock(path, fn) {
  await mkdir(dirname(path), { recursive: true });
  return withFileLock(path.endsWith(".lock") ? path.slice(0, -5) : path, fn, { waitMs: 1e3 });
}

// shared/profile.ts
import { readFile as readFile2, realpath as realpath2 } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname as dirname2, join, resolve as resolve2 } from "node:path";
import { parseDocument } from "yaml";

// shared/types.ts
var protectedNames = /* @__PURE__ */ new Set(["dsh-compat-guardian", "dsh-autocompose"]);
function isProtected(name) {
  return name.startsWith("@deepseek-ai/") || protectedNames.has(name);
}

// shared/profile.ts
async function locateManifest(name, anchors) {
  packageName(name);
  for (const anchor of anchors) {
    const require2 = createRequire(resolve2(anchor));
    for (const searchPath of require2.resolve.paths(name) ?? []) {
      const direct = join(searchPath, ...name.split("/"), "package.json");
      const raw = await optionalText(direct);
      if (raw !== void 0) {
        const manifest = object(JSON.parse(raw), direct);
        if (manifest.name !== name) throw new Error(`\u5305\u8EAB\u4EFD\u4E0D\u4E00\u81F4\uFF1A\u9700\u8981 ${name}\uFF0C\u5B9E\u9645 ${manifest.name}`);
        return { manifest, directory: dirname2(await realpath2(direct)) };
      }
    }
    let entry;
    try {
      entry = require2.resolve(`${name}/package.json`);
    } catch {
      try {
        entry = require2.resolve(name);
      } catch {
        continue;
      }
    }
    let dir = dirname2(entry);
    for (; ; ) {
      const text = await optionalText(join(dir, "package.json"));
      if (text) {
        const manifest = object(JSON.parse(text), "package.json");
        if (manifest.name === name) return { manifest, directory: await realpath2(dir) };
      }
      if (dirname2(dir) === dir) break;
      dir = dirname2(dir);
    }
  }
  throw new Error(`\u627E\u4E0D\u5230\u5DF2\u5B89\u88C5\u7684 ${name}\uFF0C\u672A\u5BFC\u5165\u63D2\u4EF6\u4EE3\u7801`);
}
async function declaredRows(directory, manifest) {
  const patch = manifest.dsh?.bundle?.patch;
  if (!patch) return { rowIds: [], duplicateRowIds: [] };
  const files = typeof patch === "string" ? [patch] : patch;
  if (!Array.isArray(files) || files.some((x) => typeof x !== "string")) throw new Error("bundle.patch \u683C\u5F0F\u65E0\u6548");
  const rowIds = [], duplicates = /* @__PURE__ */ new Set();
  for (const file of files) {
    const path = within(directory, resolve2(directory, file));
    within(await realpath2(directory), await realpath2(path));
    const document = parseDocument(await readFile2(path, "utf8"), { customTags: [{ tag: "tag:yaml.org,2002:js", resolve: (text) => text }] });
    if (document.errors.length) throw new Error(`\u65E0\u6CD5\u89E3\u6790 ${file}: ${document.errors[0].message}`);
    const patches = document.toJS({ maxAliasCount: 100 });
    if (!Array.isArray(patches)) throw new Error("bundle patch \u5FC5\u987B\u662F\u6570\u7EC4");
    for (const patch2 of patches) {
      if (!patch2 || typeof patch2 !== "object" || !Array.isArray(patch2.insert)) continue;
      for (const row of patch2.insert) {
        if (typeof row?.id !== "string" || typeof row?.name !== "string") continue;
        if (rowIds.includes(row.id)) duplicates.add(row.id);
        else rowIds.push(row.id);
      }
    }
  }
  return { rowIds, duplicateRowIds: [...duplicates] };
}
async function checkClientArtifact(directory, manifest) {
  const dsh = manifest.dsh;
  if (dsh?.client?.platform !== "web") return;
  const exported = manifest.exports?.["./client"];
  const client = typeof exported === "string" ? exported : exported && typeof exported === "object" ? exported.default : void 0;
  if (typeof client !== "string" || !client.startsWith("./")) throw new Error(`${manifest.name} \u7F3A\u5C11\u53EF\u7528\u7684 ./client \u5BFC\u51FA`);
  const file = within(directory, resolve2(directory, client));
  within(await realpath2(directory), await realpath2(file));
}
async function scanProfile(directory, installAnchor) {
  const profilePath = join(directory, "package.json");
  const manifest = object(JSON.parse(await readFile2(profilePath, "utf8")), "profile package.json");
  const selected = manifest.dsh?.profile?.bundles;
  if (!Array.isArray(selected) || selected.some((x) => typeof x !== "string")) throw new Error("\u76EE\u6807\u76EE\u5F55\u6CA1\u6709\u6709\u6548\u7684 dsh.profile.bundles");
  const names = [.../* @__PURE__ */ new Set([...selected, ...Object.keys(manifest.dependencies ?? {})])];
  const records = [];
  for (const name of names) {
    const base = { name, enabled: selected.includes(name), protected: isProtected(name), removable: Object.hasOwn(manifest.dependencies ?? {}, name) && !isProtected(name) };
    try {
      const { manifest: installed, directory: packageDir } = await locateManifest(name, [...installAnchor ? [installAnchor] : [], profilePath]);
      if (!installed.dsh?.bundle && !base.enabled) continue;
      let rows = { rowIds: [], duplicateRowIds: [] };
      let loadError;
      try {
        rows = await declaredRows(packageDir, installed);
        await checkClientArtifact(packageDir, installed);
      } catch (error) {
        loadError = String(error);
      }
      if (!installed.dsh?.bundle) loadError = `${name} \u672A\u58F0\u660E dsh.bundle`;
      records.push({
        ...base,
        version: installed.version ?? "unknown",
        manifest: installed,
        directory: packageDir,
        ...rows,
        ...loadError ? { loadError } : {}
      });
    } catch (error) {
      records.push({ ...base, version: "unknown", manifest: {}, rowIds: [], loadError: String(error) });
    }
  }
  return records;
}

// src/rescue.ts
async function rescueProfile(directory, runtimeVersion, options = {}) {
  directory = resolve3(directory);
  const manifestPath = join2(directory, "package.json");
  const action = async () => {
    const inventory = await scanProfile(directory, options.installAnchor);
    const report = checkCompatibility(inventory, runtimeVersion);
    const targets = options.targets ?? report.quarantine;
    for (const target of targets) {
      const plugin = inventory.find((x) => x.name === target);
      if (!plugin || !plugin.enabled || plugin.protected) throw new Error(`\u4E0D\u80FD\u9694\u79BB\u672A\u542F\u7528\u6216\u53D7\u4FDD\u62A4\u7684\u63D2\u4EF6\uFF1A${target}`);
    }
    if (!options.apply || !targets.length) return { applied: false, targets, report };
    const before = await optionalText(manifestPath);
    const manifest = JSON.parse(before);
    const selected = manifest.dsh.profile.bundles;
    const removed = targets.map((name) => ({ name, version: inventory.find((x) => x.name === name).version, index: selected.indexOf(name) }));
    manifest.dsh.profile.bundles = selected.filter((x) => !targets.includes(x));
    const after = `${JSON.stringify(manifest, null, 2)}
`;
    const otherFiles = {};
    for (const name of ["cordis.patch.yml", "pnpm-lock.yaml", "pnpm-workspace.yaml", "compatibility.json"]) {
      const text = await optionalText(join2(directory, name));
      if (text !== void 0) otherFiles[name] = text;
    }
    const record = {
      schemaVersion: 1,
      id: randomUUID2(),
      directory,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      runtimeVersion,
      removed,
      before,
      beforeHash: digest(before),
      afterHash: digest(after),
      otherFiles,
      status: "prepared"
    };
    const recordPath = join2(directory, ".compat-guardian", "rescue", `${record.id}.json`);
    await writeJson(recordPath, record);
    await atomicWrite(manifestPath, after);
    record.status = "applied";
    await writeJson(recordPath, record);
    return { applied: true, targets, report, recoveryId: record.id, recordPath };
  };
  return options.apply ? withLock(`${manifestPath}.lock`, action) : action();
}
async function restoreRescue(directory, id, runtimeVersion, installAnchor) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("\u6062\u590D\u8BB0\u5F55 ID \u65E0\u6548");
  directory = resolve3(directory);
  const manifestPath = join2(directory, "package.json");
  return withLock(`${manifestPath}.lock`, async () => {
    const recordPath = join2(directory, ".compat-guardian", "rescue", `${id}.json`);
    const record = await readJson(recordPath);
    const currentText = await optionalText(manifestPath);
    const interruptedAfterWrite = record.status === "prepared" && digest(currentText) === record.afterHash;
    if (record.directory !== directory || record.status !== "applied" && !interruptedAfterWrite || digest(record.before) !== record.beforeHash) throw new Error("\u6062\u590D\u8BB0\u5F55\u65E0\u6548\u6216\u5DF2\u7ECF\u6062\u590D");
    const inventory = await scanProfile(directory, installAnchor);
    for (const target of record.removed) {
      const installed = inventory.find((x) => x.name === target.name);
      if (!installed || installed.version !== target.version || installed.loadError) throw new Error(`${target.name} \u7684\u5B89\u88C5\u5185\u5BB9\u4E0D\u53EF\u6062\u590D\uFF0C\u8BF7\u5148\u4FEE\u590D\u5B89\u88C5`);
    }
    const enabled = inventory.map((x) => record.removed.some((r) => r.name === x.name) ? { ...x, enabled: true } : x);
    const report = checkCompatibility(enabled, runtimeVersion);
    if (report.findings.some((x) => x.severity === "error" && x.plugins.some((name) => record.removed.some((r) => r.name === name)))) throw new Error("\u51B2\u7A81\u4ECD\u5B58\u5728\uFF0C\u4E0D\u80FD\u6062\u590D");
    const raw = await optionalText(manifestPath);
    const manifest = JSON.parse(raw);
    const selected = manifest.dsh?.profile?.bundles;
    if (!Array.isArray(selected)) throw new Error("\u5F53\u524D profile \u65E0\u6548");
    for (const item of [...record.removed].sort((a, b) => a.index - b.index)) {
      if (!selected.includes(item.name)) selected.splice(Math.min(item.index, selected.length), 0, item.name);
    }
    await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}
`);
    record.status = "restored";
    await writeJson(recordPath, record);
    return { restored: record.removed.map((x) => x.name), recordPath };
  });
}

// src/cli.ts
var help = `dsh-compat-guardian ${createRequire2(import.meta.url)("../package.json").version}
  check --profile-dir <\u76EE\u5F55> --dsh-version <\u76EE\u6807\u7248\u672C>
  rescue --profile-dir <\u76EE\u5F55> --dsh-version <\u7248\u672C> [--yes] [--plugins <\u5305\u540D,\u5305\u540D>]
  restore --profile-dir <\u76EE\u5F55> --dsh-version <\u7248\u672C> --id <recoveryId> --yes

\u53EF\u9009\uFF1A--install-anchor <DSH \u5B89\u88C5\u5305\u7684 package.json>
check \u548C\u672A\u52A0 --yes \u7684 rescue \u53EA\u8BFB\u3002rescue \u505C\u7528\u51B2\u7A81\u63D2\u4EF6\u5E76\u4FDD\u5B58\u539F\u914D\u7F6E\uFF0C\u4E0D\u52A0\u8F7D\u7B2C\u4E09\u65B9\u4EE3\u7801\u3002
rescue/restore \u7528\u4E8E DSH \u5DF2\u5173\u95ED\u540E\u7684\u542F\u52A8\u4FEE\u590D\uFF1B\u5728\u7EBF\u4F7F\u7528 compat_guardian \u5DE5\u5177\u3002`;
async function main() {
  const { values: args, positionals } = parseArgs({ allowPositionals: true, options: {
    "profile-dir": { type: "string" },
    "dsh-version": { type: "string" },
    "install-anchor": { type: "string" },
    plugins: { type: "string" },
    id: { type: "string" },
    yes: { type: "boolean" },
    help: { type: "boolean", short: "h" }
  } });
  const command = positionals[0];
  if (!command || args.help) {
    console.log(help);
    return;
  }
  if (!args["profile-dir"] || !args["dsh-version"]) throw new Error("\u5FC5\u987B\u63D0\u4F9B --profile-dir \u548C --dsh-version");
  const directory = resolve4(args["profile-dir"]), runtime = args["dsh-version"];
  let anchor = args["install-anchor"] ? resolve4(args["install-anchor"]) : void 0;
  if (!anchor) {
    try {
      anchor = createRequire2(import.meta.url).resolve("@deepseek-ai/dsh/package.json");
    } catch {
    }
  }
  let result;
  if (command === "check" || command === "rescue") {
    result = await rescueProfile(directory, runtime, {
      apply: command === "rescue" && args.yes === true,
      installAnchor: anchor,
      targets: command === "rescue" ? args.plugins?.split(",").map((x) => x.trim()).filter(Boolean) : void 0
    });
    if (command === "check" && result.report.findings.some((x) => x.severity === "error")) process.exitCode = 2;
  } else if (command === "restore") {
    if (!args.yes) throw new Error("\u6062\u590D\u914D\u7F6E\u9700\u8981 --yes");
    result = await restoreRescue(directory, args.id ?? "", runtime, anchor);
  } else throw new Error(`\u672A\u77E5\u547D\u4EE4\uFF1A${command}`);
  console.log(JSON.stringify(result, null, 2));
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
//# sourceMappingURL=cli.js.map
