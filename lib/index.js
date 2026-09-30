var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __knownSymbol = (name2, symbol) => (symbol = Symbol[name2]) ? symbol : Symbol.for("Symbol." + name2);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __decoratorStart = (base) => [, , , __create(base?.[__knownSymbol("metadata")] ?? null)];
var __decoratorStrings = ["class", "method", "getter", "setter", "accessor", "field", "value", "get", "set"];
var __expectFn = (fn) => fn !== void 0 && typeof fn !== "function" ? __typeError("Function expected") : fn;
var __decoratorContext = (kind, name2, done, metadata, fns) => ({ kind: __decoratorStrings[kind], name: name2, metadata, addInitializer: (fn) => done._ ? __typeError("Already initialized") : fns.push(__expectFn(fn || null)) });
var __decoratorMetadata = (array, target) => __defNormalProp(target, __knownSymbol("metadata"), array[3]);
var __runInitializers = (array, flags, self, value) => {
  for (var i = 0, fns = array[flags >> 1], n = fns && fns.length; i < n; i++) flags & 1 ? fns[i].call(self) : value = fns[i].call(self, value);
  return value;
};
var __decorateElement = (array, flags, name2, decorators, target, extra) => {
  var fn, it, done, ctx, access, k = flags & 7, s = !!(flags & 8), p = !!(flags & 16);
  var j = k > 3 ? array.length + 1 : k ? s ? 1 : 2 : 0, key = __decoratorStrings[k + 5];
  var initializers = k > 3 && (array[j - 1] = []), extraInitializers = array[j] || (array[j] = []);
  var desc = k && (!p && !s && (target = target.prototype), k < 5 && (k > 3 || !p) && __getOwnPropDesc(k < 4 ? target : { get [name2]() {
    return __privateGet(this, extra);
  }, set [name2](x) {
    return __privateSet(this, extra, x);
  } }, name2));
  k ? p && k < 4 && __name(extra, (k > 2 ? "set " : k > 1 ? "get " : "") + name2) : __name(target, name2);
  for (var i = decorators.length - 1; i >= 0; i--) {
    ctx = __decoratorContext(k, name2, done = {}, array[3], extraInitializers);
    if (k) {
      ctx.static = s, ctx.private = p, access = ctx.access = { has: p ? (x) => __privateIn(target, x) : (x) => name2 in x };
      if (k ^ 3) access.get = p ? (x) => (k ^ 1 ? __privateGet : __privateMethod)(x, target, k ^ 4 ? extra : desc.get) : (x) => x[name2];
      if (k > 2) access.set = p ? (x, y) => __privateSet(x, target, y, k ^ 4 ? extra : desc.set) : (x, y) => x[name2] = y;
    }
    it = (0, decorators[i])(k ? k < 4 ? p ? extra : desc[key] : k > 4 ? void 0 : { get: desc.get, set: desc.set } : target, ctx), done._ = 1;
    if (k ^ 4 || it === void 0) __expectFn(it) && (k > 4 ? initializers.unshift(it) : k ? p ? extra = it : desc[key] = it : target = it);
    else if (typeof it !== "object" || it === null) __typeError("Object expected");
    else __expectFn(fn = it.get) && (desc.get = fn), __expectFn(fn = it.set) && (desc.set = fn), __expectFn(fn = it.init) && initializers.unshift(fn);
  }
  return k || __decoratorMetadata(array, target), desc && __defProp(target, name2, desc), p ? k ^ 4 ? extra : desc : target;
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateIn = (member, obj) => Object(obj) !== obj ? __typeError('Cannot use the "in" operator on this value') : member.has(obj);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

// src/index.ts
import { defineTool } from "@deepseek-ai/dsh-tools";
import { getDshRuntimeVersion } from "@deepseek-ai/dsh-app-boot";

// shared/approval.ts
import { approveEscalation } from "@deepseek-ai/dsh-sandbox";
async function approve(ctx, exec, subject, justification) {
  const policy2 = ctx.sandboxPolicy.resolve(exec.agent ? { session: exec.agent.session } : {});
  await approveEscalation(
    { requestedMode: "danger-full-access", effectiveMode: policy2.mode, subject, justification },
    { approver: ctx.get("approval"), agent: exec.agent, callId: exec.callId, toolName: exec.name, signal: exec.signal }
  );
  exec.signal.throwIfAborted();
}

// src/guardian.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import { join as join2 } from "node:path";

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
    for (const [name2, range] of Object.entries(object(data[key], key))) {
      packageName(name2);
      const rule = string(range, `${key}.${name2}`);
      if (!semver.validRange(rule)) throw new Error(`${key}.${name2} \u7248\u672C\u8303\u56F4\u65E0\u6548`);
      out[key][name2] = rule;
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
          for (const [name2, range] of Object.entries(object(plugin.manifest[field], field))) string(range, `${field}.${name2}`);
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
    const dshPeers = Object.entries(peers).filter(([name2]) => name2 === "@deepseek-ai/dsh" || name2.startsWith("@deepseek-ai/dsh-"));
    const ranges = [...dshPeers, ...meta.dsh ? [["dshCompat.dsh", meta.dsh]] : []];
    if (!ranges.length && !plugin.protected) add("unknown-compatibility", [plugin.name], `${plugin.name} \u672A\u58F0\u660E DSH \u7248\u672C\u8303\u56F4\uFF1B\u517C\u5BB9\u6027\u672A\u77E5`, "warning");
    for (const [name2, range] of options.runtimeCompanions?.has(plugin.name) ? [] : ranges) {
      const normalized = typeof range === "string" && ["workspace:*", "workspace:^", "workspace:~"].includes(range) ? runtime : range;
      if (typeof normalized !== "string" || !matches(runtime, normalized)) {
        add("dsh-version", [plugin.name], `${plugin.name}@${plugin.version} \u8981\u6C42 ${name2} ${String(range)}\uFF0C\u5F53\u524D DSH \u4E3A ${runtime}`);
      }
    }
    const sharedRuntime = /* @__PURE__ */ new Set(["@deepseek-ai/dsh-tools", "@deepseek-ai/dsh-agent", "@deepseek-ai/dsh-session", "@deepseek-ai/dsh-llm", "@deepseek-ai/dsh-sandbox-policy"]);
    for (const [name2, range] of Object.entries(plugin.manifest.dependencies ?? {})) {
      if (!options.runtimeCompanions?.has(plugin.name) && sharedRuntime.has(name2) && (typeof range !== "string" || !range.startsWith("workspace:") && !matches(runtime, range))) {
        add("embedded-runtime", [plugin.name], `${plugin.name} \u76F4\u63A5\u4F9D\u8D56 ${name2} ${String(range)}\uFF0C\u4F1A\u5F15\u5165\u4E0E\u5BBF\u4E3B ${runtime} \u4E0D\u4E00\u81F4\u7684\u6838\u5FC3\u7EC4\u4EF6\uFF1B\u5E94\u7531\u7EF4\u62A4\u8005\u6539\u4E3A\u5339\u914D\u7684 peerDependencies`);
      }
    }
    if (plugin.manifest.engines?.node && !matches(options.nodeVersion ?? process.version, plugin.manifest.engines.node)) {
      add("node-version", [plugin.name], `${plugin.name} \u8981\u6C42 Node.js ${plugin.manifest.engines.node}`);
    }
    const platform = options.platform ?? process.platform;
    const os = plugin.manifest.os;
    if (os && (os.includes(`!${platform}`) || os.some((x) => !x.startsWith("!")) && !os.includes(platform)) || meta.platforms && !meta.platforms.includes(platform)) add("platform", [plugin.name], `${plugin.name} \u4E0D\u652F\u6301 ${platform}`);
    for (const [name2, range] of Object.entries(meta.requires ?? {})) {
      const dependency = byName.get(name2);
      if (!dependency) add("missing-dependency", [plugin.name], `${plugin.name} \u9700\u8981\u542F\u7528 ${name2} ${range}`);
      else if (!matches(dependency.version, range)) add("dependency-version", [plugin.name], `${plugin.name} \u9700\u8981 ${name2} ${range}\uFF0C\u5B9E\u9645\u4E3A ${dependency.version}`);
    }
    for (const [name2, range] of Object.entries(peers)) {
      if (name2 === "@deepseek-ai/dsh" || name2.startsWith("@deepseek-ai/dsh-") || typeof range !== "string") continue;
      const dependency = byName.get(name2)?.version ?? options.dependencyVersions?.[name2];
      if (dependency && !range.startsWith("workspace:") && !matches(dependency, range)) {
        add("dependency-version", [plugin.name], `${plugin.name} \u8981\u6C42 peer ${name2} ${range}\uFF0C\u5B9E\u9645\u4E3A ${dependency}`);
      }
    }
    for (const [name2, range] of Object.entries(meta.conflicts ?? {})) {
      const other = byName.get(name2);
      if (other && other !== plugin && matches(other.version, range)) add("declared-conflict", [plugin.name, name2], `${plugin.name} \u4E0E ${name2}@${other.version} \u51B2\u7A81`);
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
    const [kind, ...name2] = claim.split(":");
    add(`duplicate-${kind}`, plugins, `${plugins.join("\u3001")} \u91CD\u590D\u63D0\u4F9B ${kind} ${name2.join(":")}`);
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

// src/guardian.ts
import semver3 from "semver";

// shared/profile.ts
import { readFile as readFile2, realpath as realpath2 } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname as dirname2, join, resolve as resolve2 } from "node:path";
import { parseDocument } from "yaml";

// shared/types.ts
var protectedNames = /* @__PURE__ */ new Set(["dsh-compat-guardian", "dsh-autocompose"]);
function isProtected(name2) {
  return name2.startsWith("@deepseek-ai/") || protectedNames.has(name2);
}

// shared/profile.ts
async function locateManifest(name2, anchors) {
  packageName(name2);
  for (const anchor of anchors) {
    const require2 = createRequire(resolve2(anchor));
    for (const searchPath of require2.resolve.paths(name2) ?? []) {
      const direct = join(searchPath, ...name2.split("/"), "package.json");
      const raw = await optionalText(direct);
      if (raw !== void 0) {
        const manifest = object(JSON.parse(raw), direct);
        if (manifest.name !== name2) throw new Error(`\u5305\u8EAB\u4EFD\u4E0D\u4E00\u81F4\uFF1A\u9700\u8981 ${name2}\uFF0C\u5B9E\u9645 ${manifest.name}`);
        return { manifest, directory: dirname2(await realpath2(direct)) };
      }
    }
    let entry;
    try {
      entry = require2.resolve(`${name2}/package.json`);
    } catch {
      try {
        entry = require2.resolve(name2);
      } catch {
        continue;
      }
    }
    let dir = dirname2(entry);
    for (; ; ) {
      const text = await optionalText(join(dir, "package.json"));
      if (text) {
        const manifest = object(JSON.parse(text), "package.json");
        if (manifest.name === name2) return { manifest, directory: await realpath2(dir) };
      }
      if (dirname2(dir) === dir) break;
      dir = dirname2(dir);
    }
  }
  throw new Error(`\u627E\u4E0D\u5230\u5DF2\u5B89\u88C5\u7684 ${name2}\uFF0C\u672A\u5BFC\u5165\u63D2\u4EF6\u4EE3\u7801`);
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
  for (const name2 of names) {
    const base = { name: name2, enabled: selected.includes(name2), protected: isProtected(name2), removable: Object.hasOwn(manifest.dependencies ?? {}, name2) && !isProtected(name2) };
    try {
      const { manifest: installed, directory: packageDir } = await locateManifest(name2, [...installAnchor ? [installAnchor] : [], profilePath]);
      if (!installed.dsh?.bundle && !base.enabled) continue;
      let rows = { rowIds: [], duplicateRowIds: [] };
      let loadError;
      try {
        rows = await declaredRows(packageDir, installed);
        await checkClientArtifact(packageDir, installed);
      } catch (error) {
        loadError = String(error);
      }
      if (!installed.dsh?.bundle) loadError = `${name2} \u672A\u58F0\u660E dsh.bundle`;
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

// src/guardian.ts
var runtimeCompanions = /* @__PURE__ */ new Set([
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app",
  "@deepseek-ai/dsh-headless",
  "@deepseek-ai/dsh-sdk-app",
  "@deepseek-ai/dsh-sdk-minimal",
  "@deepseek-ai/dsh-acp-app"
]);
var Guardian = class {
  options;
  manager;
  statePath;
  attemptedRemovals = /* @__PURE__ */ new Set();
  constructor(manager, options) {
    this.manager = manager;
    this.options = options;
    this.statePath = join2(options.directory, ".compat-guardian", "state.json");
    if (options.policy && !["report", "quarantine", "remove"].includes(options.policy)) throw new Error("\u65E0\u6548\u7684 guardian policy");
    if (options.failureThreshold !== void 0 && (!Number.isInteger(options.failureThreshold) || options.failureThreshold < 1)) throw new Error("failureThreshold \u5FC5\u987B\u4E3A\u6B63\u6574\u6570");
  }
  async state() {
    const raw = await optionalText(this.statePath);
    if (!raw) return { schemaVersion: 1, failures: {}, records: [] };
    const state = JSON.parse(raw);
    if (state.schemaVersion !== 1 || !Array.isArray(state.records) || !state.failures) throw new Error("Guardian \u72B6\u6001\u6587\u4EF6\u683C\u5F0F\u65E0\u6548");
    return state;
  }
  async snapshot(bundles) {
    const files = {};
    for (const name2 of ["package.json", "cordis.patch.yml", "pnpm-lock.yaml", "pnpm-workspace.yaml", "compatibility.json"]) {
      const text = await optionalText(join2(this.options.directory, name2));
      if (text !== void 0) files[name2] = text;
    }
    return { files, bundles: bundles.filter((x) => x.enabled).map((x) => x.name) };
  }
  async inspect() {
    const records = await this.inventory();
    return checkCompatibility(records, this.options.runtimeVersion, this.liveOptions(records));
  }
  liveOptions(records) {
    return { activePlugins: new Set(records.filter((x) => x.state === "active" && !x.loadError).map((x) => x.name)) };
  }
  async policy() {
    const raw = await optionalText(join2(this.options.directory, ".compat-guardian", "preferences.json"));
    const policy2 = raw ? JSON.parse(raw).policy : this.options.policy ?? "quarantine";
    if (!["report", "quarantine", "remove"].includes(policy2)) throw new Error("\u4FDD\u5B58\u7684\u81EA\u52A8\u5904\u7406\u7B56\u7565\u65E0\u6548");
    return policy2;
  }
  async setPolicy(policy2) {
    if (!["report", "quarantine", "remove"].includes(policy2)) throw new Error("\u65E0\u6548\u7B56\u7565");
    await withLock(join2(this.options.directory, ".compat-guardian", "operation.lock"), () => writeJson(join2(this.options.directory, ".compat-guardian", "preferences.json"), { policy: policy2 }));
  }
  revision(inventory, state) {
    return digest(JSON.stringify({ inventory, pending: state.records.filter((x) => x.removalPending).map((x) => [x.id, x.status, x.version]) }));
  }
  async overview(targetVersion = this.options.runtimeVersion) {
    if (!semver3.valid(targetVersion)) throw new Error("\u8BF7\u8F93\u5165\u5B8C\u6574\u7684 DSH \u7248\u672C\uFF0C\u4F8B\u5982 0.2.0-rc.2");
    const inventory = await this.inventory(), state = await this.state();
    const forecast = targetVersion !== this.options.runtimeVersion;
    const projected = forecast ? inventory.map((x) => runtimeCompanions.has(x.name) ? { ...x, version: targetVersion } : x) : inventory;
    return {
      runtimeVersion: this.options.runtimeVersion,
      targetVersion,
      checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
      profile: this.options.directory,
      policy: await this.policy(),
      revision: this.revision(inventory, state),
      report: checkCompatibility(projected, targetVersion, { ...this.liveOptions(inventory), ...forecast ? { runtimeCompanions } : {} }),
      plugins: inventory.map(({ name: name2, version, enabled, protected: protectedPlugin, loadError }) => ({ name: name2, version, enabled, protected: protectedPlugin, loadError })),
      records: state.records.slice(-100).reverse().map(({ snapshot: _snapshot, ...record }) => record)
    };
  }
  async inventory() {
    const [records, bundles, plugins] = await Promise.all([
      this.options.scan?.() ?? scanProfile(this.options.directory, this.options.installAnchor),
      this.manager.listBundles(),
      this.manager.listPlugins()
    ]);
    return records.map((record) => {
      const bundle = bundles.find((x) => x.name === record.name);
      if (!bundle) return record;
      const failed = bundle.rows.filter((row) => plugins.some((x) => x.entryId === row.entryId && x.enabled && x.fiberPhase === "failed"));
      const observed = plugins.filter((x) => x.enabled && bundle.rows.some((row) => x.entryId === row.entryId));
      return {
        ...record,
        version: record.version === "unknown" ? bundle.version ?? record.version : record.version,
        enabled: bundle.enabled,
        removable: bundle.removable,
        ...observed.length && observed.every((x) => x.fiberPhase === "active") ? { state: "active" } : {},
        protected: record.protected || bundle.readOnlyReason === "management-required",
        ...bundle.error ? { loadError: `${bundle.error.code}: ${bundle.error.diagnostic ?? ""}` } : {},
        ...failed.length ? { loadError: `\u52A0\u8F7D\u5931\u8D25\u7684\u63D2\u4EF6\u6761\u76EE\uFF1A${failed.map((x) => x.rowId).join("\u3001")}`, state: "failed" } : {}
      };
    });
  }
  async removeQuarantined(record) {
    if (this.attemptedRemovals.has(record.id)) return;
    this.attemptedRemovals.add(record.id);
    const bundle = (await this.manager.listBundles()).find((x) => x.name === record.plugin);
    if (!bundle?.installed) {
      record.status = "removed";
      record.removalPending = false;
      return;
    }
    if (bundle.enabled || !bundle.removable || bundle.version !== record.version) {
      record.removalPending = false;
      record.error = "\u63D2\u4EF6\u72B6\u6001\u3001\u7248\u672C\u6216\u79FB\u9664\u6743\u9650\u5DF2\u6539\u53D8\uFF0C\u53D6\u6D88\u5F85\u6267\u884C\u5378\u8F7D";
      return;
    }
    try {
      record.result = await this.manager.removeBundle(record.plugin);
      if (!["applied", "restart-required"].includes(record.result.application)) throw new Error(`\u5378\u8F7D\u672A\u5B8C\u6210\uFF1A${JSON.stringify(record.result)}`);
      if ((await this.manager.listBundles()).some((x) => x.name === record.plugin && x.installed)) throw new Error("\u5378\u8F7D\u540E\u4F9D\u8D56\u4ECD\u5B58\u5728");
      record.status = "removed";
      record.removalPending = false;
      delete record.error;
    } catch (error) {
      record.error = String(error);
    }
  }
  async reconcile(requestedPolicy, expectedRevision) {
    return withLock(join2(this.options.directory, ".compat-guardian", "operation.lock"), async () => {
      const policy2 = requestedPolicy ?? await this.policy();
      if (!["report", "quarantine", "remove"].includes(policy2)) throw new Error("\u65E0\u6548\u7B56\u7565");
      const state = await this.state();
      const runtimeChanged = state.runtimeVersion !== void 0 && state.runtimeVersion !== this.options.runtimeVersion;
      state.runtimeVersion = this.options.runtimeVersion;
      const inventory = await this.inventory();
      if (expectedRevision && this.revision(inventory, state) !== expectedRevision) throw new Error("\u63D2\u4EF6\u72B6\u6001\u5DF2\u53D8\u5316\uFF0C\u8BF7\u5237\u65B0\u68C0\u67E5\u7ED3\u679C\u540E\u91CD\u8BD5");
      const observedBundles = await this.manager.listBundles();
      for (const record of state.records.filter((x) => x.status === "prepared" || x.status === "quarantined")) {
        const observed = observedBundles.find((x) => x.name === record.plugin);
        if (!observed?.installed) {
          record.status = "removed";
          record.removalPending = false;
        } else if (observed.version === record.version && !observed.enabled) record.status = "quarantined";
        else if (record.status === "quarantined") {
          record.status = observed.version === record.version ? "restored" : "superseded";
          record.removalPending = false;
          delete record.error;
          delete record.result;
        } else if (record.status === "prepared") {
          record.status = "failed";
          record.error = "\u4E0A\u4E00\u6B21\u5904\u7406\u88AB\u4E2D\u65AD\uFF0C\u5F53\u524D\u63D2\u4EF6\u4ECD\u542F\u7528\u6216\u7248\u672C\u5DF2\u53D8\u5316";
        }
      }
      const threshold = this.options.failureThreshold ?? 2;
      const currentKeys = new Set(inventory.map((x) => `${x.name}@${x.version}|${this.options.runtimeVersion}`));
      for (const key of Object.keys(state.failures)) if (!currentKeys.has(key)) delete state.failures[key];
      for (const record of inventory) {
        const key = `${record.name}@${record.version}|${this.options.runtimeVersion}`;
        if (record.enabled && record.loadError) state.failures[key] = (state.failures[key] ?? 0) + 1;
        else delete state.failures[key];
      }
      const stable = inventory.map((record) => {
        const key = `${record.name}@${record.version}|${this.options.runtimeVersion}`;
        if ((state.failures[key] ?? 0) >= threshold) return record;
        return { ...record, loadError: void 0, state: record.state === "failed" ? "pending" : record.state };
      });
      const report = checkCompatibility(stable, this.options.runtimeVersion, this.liveOptions(inventory));
      const changes = [];
      await writeJson(this.statePath, state);
      if (policy2 === "report") return { report, changes, runtimeChanged };
      if (policy2 === "remove") {
        for (const pending of state.records.filter((x) => x.status === "quarantined" && x.removalPending && !this.attemptedRemovals.has(x.id))) {
          const target = inventory.find((x) => x.name === pending.plugin);
          if (target?.protected) continue;
          await this.removeQuarantined(pending);
          changes.push(pending);
          await writeJson(this.statePath, state);
        }
      }
      for (const name2 of report.quarantine) {
        const target = inventory.find((x) => x.name === name2);
        const current = await this.manager.listBundles();
        const bundle = current.find((x) => x.name === name2);
        if (!bundle?.enabled || target.protected || bundle.version && bundle.version !== target.version) continue;
        const record = {
          id: randomUUID2(),
          at: (/* @__PURE__ */ new Date()).toISOString(),
          plugin: name2,
          version: target.version,
          runtimeVersion: this.options.runtimeVersion,
          status: "prepared",
          reason: report.findings.filter((x) => x.plugins.includes(name2)).map((x) => x.message),
          snapshot: await this.snapshot(current)
        };
        if (!record.reason.length) record.reason.push("\u4F9D\u8D56\u63D2\u4EF6\u88AB\u9694\u79BB\uFF0C\u8054\u52A8\u505C\u7528\u4F9D\u8D56\u5B83\u7684\u63D2\u4EF6");
        state.records.push(record);
        changes.push(record);
        await writeJson(this.statePath, state);
        try {
          record.result = await this.manager.setBundleEnabled(name2, false);
          if (!["applied", "restart-required"].includes(record.result.application)) throw new Error(`\u505C\u7528\u672A\u751F\u6548\uFF1A${JSON.stringify(record.result)}`);
          const after = (await this.manager.listBundles()).find((x) => x.name === name2);
          if (after?.enabled) throw new Error("\u505C\u7528\u540E\u4ECD\u88AB\u9009\u4E2D\uFF0C\u8BF7\u68C0\u67E5\u66F4\u9AD8\u4F18\u5148\u7EA7\u914D\u7F6E");
          record.status = "quarantined";
          record.removalPending = policy2 === "remove" && bundle.removable && target.removable;
          await writeJson(this.statePath, state);
          if (record.removalPending) await this.removeQuarantined(record);
        } catch (error) {
          record.error = String(error);
          if (record.status === "prepared") record.status = "failed";
        }
        await writeJson(this.statePath, state);
      }
      return { report, changes, runtimeChanged };
    });
  }
  async restore(id) {
    return withLock(join2(this.options.directory, ".compat-guardian", "operation.lock"), async () => {
      const state = await this.state();
      const record = state.records.find((x) => x.id === id);
      if (!record || record.status !== "quarantined") throw new Error("\u53EA\u80FD\u6062\u590D\u4ECD\u7136\u4FDD\u7559\u5B89\u88C5\u6587\u4EF6\u7684\u9694\u79BB\u8BB0\u5F55\uFF1B\u5DF2\u5378\u8F7D\u63D2\u4EF6\u9700\u5148\u91CD\u65B0\u5B89\u88C5\u539F\u7248\u672C");
      const inventory = await this.inventory();
      const target = inventory.find((x) => x.name === record.plugin);
      if (!target || target.version !== record.version) throw new Error("\u63D2\u4EF6\u7248\u672C\u5DF2\u53D8\u5316\uFF0C\u8BF7\u68C0\u67E5\u65B0\u7248\u672C\u540E\u5355\u72EC\u542F\u7528");
      const report = checkCompatibility(inventory.map((x) => x.name === target.name ? { ...x, enabled: true, loadError: void 0, state: "active" } : x), this.options.runtimeVersion);
      if (report.findings.some((x) => x.severity === "error" && x.plugins.includes(target.name))) throw new Error("\u517C\u5BB9\u6027\u51B2\u7A81\u4ECD\u5B58\u5728\uFF0C\u6062\u590D\u88AB\u62D2\u7EDD");
      const result = await this.manager.setBundleEnabled(target.name, true);
      if (!["applied", "restart-required"].includes(result.application)) throw new Error(`\u6062\u590D\u5931\u8D25\uFF1A${JSON.stringify(result)}`);
      if (!(await this.manager.listBundles()).find((x) => x.name === target.name)?.enabled) throw new Error("\u6062\u590D\u672A\u6301\u4E45\u5316");
      record.status = "restored";
      record.result = result;
      record.removalPending = false;
      delete record.error;
      await writeJson(this.statePath, state);
      return record;
    });
  }
};

// src/index.ts
import { TypertRemoteService, Remote } from "@deepseek-ai/dsh-typert-protocol";

// src/controller.ts
import { z } from "zod";

// shared/rpc.ts
import { string as string2 } from "zod";
function parseRequest(schema, payload) {
  if (Buffer.byteLength(payload, "utf8") > 65536) throw new Error("\u8BF7\u6C42\u8FC7\u5927");
  return schema.parse(JSON.parse(payload));
}

// src/controller.ts
var policy = z.enum(["report", "quarantine", "remove"]);
var requests = z.discriminatedUnion("action", [
  z.object({ action: z.literal("overview"), targetVersion: z.string().max(100).optional() }).strict(),
  z.object({ action: z.literal("repair"), policy, revision: z.string().length(64) }).strict(),
  z.object({ action: z.literal("restore"), recordId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("setPolicy"), policy }).strict()
]);
var publicRecord = ({ snapshot: _snapshot, ...record }) => record;
var GuardianController = class {
  constructor(guardian) {
    this.guardian = guardian;
  }
  operation;
  closed = false;
  async request(payload) {
    if (this.closed) throw new Error("\u63D2\u4EF6\u6B63\u5728\u5173\u95ED");
    const args = parseRequest(requests, payload);
    if (args.action === "overview") return JSON.stringify(await this.guardian.overview(args.targetVersion));
    if (this.operation) throw new Error("\u6B63\u5728\u5904\u7406\u53E6\u4E00\u9879\u64CD\u4F5C\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
    this.operation = (async () => {
      if (args.action === "setPolicy") {
        await this.guardian.setPolicy(args.policy);
        return { policy: args.policy };
      }
      if (args.action === "restore") return publicRecord(await this.guardian.restore(args.recordId));
      const result = await this.guardian.reconcile(args.policy, args.revision);
      return { ...result, changes: result.changes.map(publicRecord) };
    })();
    try {
      return JSON.stringify(await this.operation);
    } finally {
      this.operation = void 0;
    }
  }
  async dispose() {
    this.closed = true;
    await this.operation?.catch(() => {
    });
  }
};

// src/index.ts
var _request_dec, _a, _init;
var CompatGuardianUI = class extends (_a = TypertRemoteService, _request_dec = [Remote], _a) {
  constructor(ctx, controller) {
    super(ctx, "compatGuardianUI");
    this.controller = controller;
    __runInitializers(_init, 5, this);
  }
  async request(payload) {
    return this.controller.request(payload);
  }
};
_init = __decoratorStart(_a);
__decorateElement(_init, 1, "request", _request_dec, CompatGuardianUI);
__decoratorMetadata(_init, CompatGuardianUI);
var name = "dsh-compat-guardian";
var inject = ["tools", "sandboxPolicy", "pluginManager", "profileContext"];
function apply(ctx, config = {}) {
  const guardian = new Guardian(ctx.pluginManager, {
    directory: ctx.profileContext.dir,
    installAnchor: ctx.profileContext.installAnchor,
    runtimeVersion: getDshRuntimeVersion(),
    policy: config.policy ?? "quarantine",
    failureThreshold: config.failureThreshold
  });
  const controller = new GuardianController(guardian);
  new CompatGuardianUI(ctx, controller);
  ctx.effect(() => () => controller.dispose(), "compat-guardian: browser operations");
  const intervalMs = config.intervalMs ?? 3e4;
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 5e3) throw new Error("intervalMs \u5FC5\u987B\u81F3\u5C11\u4E3A 5000 \u6BEB\u79D2");
  let disposed = false, operation;
  const monitor = () => {
    if (disposed || operation) return;
    operation = guardian.reconcile().then((result) => {
      if (result.changes.length) ctx.logger.info(`\u517C\u5BB9\u6027\u5904\u7406\uFF1A${result.changes.map((x) => `${x.plugin}: ${x.status}`).join("\uFF1B")}`);
    }).catch((error) => ctx.logger.warn(`\u517C\u5BB9\u6027\u68C0\u67E5\u5931\u8D25\uFF1A${String(error)}`)).finally(() => {
      operation = void 0;
    });
  };
  const start = setTimeout(monitor, 5e3);
  start.unref();
  const timer = setInterval(monitor, intervalMs);
  timer.unref();
  ctx.effect(() => async () => {
    disposed = true;
    clearTimeout(start);
    clearInterval(timer);
    await operation;
  }, "compat-guardian: stop monitor");
  ctx.tools.register(defineTool({
    name: "compat_guardian",
    description: "\u68C0\u67E5 DSH \u63D2\u4EF6\u7248\u672C\u3001\u63D2\u4EF6\u95F4\u51B2\u7A81\u548C\u52A0\u8F7D\u5931\u8D25\u3002check \u53EA\u8BFB\uFF1Brepair \u6309\u914D\u7F6E\u6267\u884C\u9694\u79BB/\u5378\u8F7D\u5E76\u5148\u4FDD\u5B58\u6062\u590D\u8BB0\u5F55\uFF1Brestore \u5728\u51B2\u7A81\u6D88\u5931\u540E\u6062\u590D\u9694\u79BB\u63D2\u4EF6\u3002history \u5217\u51FA\u5904\u7406\u8BB0\u5F55\u3002\u81EA\u52A8\u7B56\u7565\u901A\u8FC7\u63D2\u4EF6\u914D\u7F6E policy=report/quarantine/remove \u8BBE\u7F6E\u3002",
    parameters: {
      action: { type: "string", required: true, enum: ["check", "repair", "restore", "history"] },
      recordId: { type: "string", description: "restore \u7684\u9694\u79BB\u8BB0\u5F55 ID\u3002" }
    },
    output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      if (args.action === "check") return JSON.stringify(await guardian.inspect());
      if (args.action === "history") {
        const state = await guardian.state();
        return JSON.stringify(state.records.map(({ snapshot: _snapshot, ...record }) => record));
      }
      const report = args.action === "repair" ? await guardian.inspect() : void 0;
      await approve(ctx, exec, "plugin compatibility recovery", `${args.action}; policy=${await guardian.policy()}; targets=${report?.quarantine.join(", ") ?? args.recordId}; profile=${ctx.profileContext.name}. \u4FEE\u6539\u5F71\u54CD\u8BE5 profile \u7684\u5168\u90E8\u4F1A\u8BDD\u3002`);
      return JSON.stringify(args.action === "restore" ? await guardian.restore(args.recordId ?? "") : await guardian.reconcile());
    }
  }));
}
export {
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
