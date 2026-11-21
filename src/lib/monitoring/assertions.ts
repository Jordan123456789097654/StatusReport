// Status-code ranges, keyword and JSONPath assertions.

/** "200-299,301,418" → matcher */
export function statusMatches(code: number, spec: string): boolean {
  const parts = (spec || "200-299").split(",").map((s) => s.trim()).filter(Boolean);
  return parts.some((p) => {
    const range = p.match(/^(\d{3})\s*-\s*(\d{3})$/);
    if (range) return code >= Number(range[1]) && code <= Number(range[2]);
    if (/^\dxx$/i.test(p)) return Math.floor(code / 100) === Number(p[0]);
    return code === Number(p);
  });
}

/** Evaluates a small JSONPath subset: $.a.b[0]['key with space'].c */
export function evalJsonPath(data: unknown, path: string): unknown {
  const p = path.trim();
  if (!p.startsWith("$")) throw new Error(`JSONPath must start with $ (got "${path}")`);
  const re = /\.([A-Za-z_$][\w$-]*)|\[(\d+)\]|\[\s*['"]([^'"]+)['"]\s*\]/g;
  let cur: unknown = data;
  let idx = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(p))) {
    if (m.index !== idx) throw new Error(`Unsupported JSONPath near "${p.slice(idx)}"`);
    idx = re.lastIndex;
    const key = m[1] ?? m[3] ?? Number(m[2]);
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  if (idx !== p.length) throw new Error(`Unsupported JSONPath near "${p.slice(idx)}"`);
  return cur;
}

const OPS = ["==", "!=", ">=", "<=", ">", "<", "contains", "exists"] as const;
export type JsonOp = (typeof OPS)[number];

/** Accepts either split fields or the inline form `$.status == "healthy"`. */
export function parseJsonAssertion(path: string, op?: string | null, expected?: string | null) {
  const inline = path.match(/^(\$[^\s=!<>]*)\s*(==|!=|>=|<=|>|<|contains|exists)\s*(.*)$/);
  if (inline) return { path: inline[1], op: inline[2] as JsonOp, expected: inline[3] };
  return { path, op: (OPS.includes(op as JsonOp) ? op : "==") as JsonOp, expected: expected ?? "" };
}

function unquote(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1);
  return t;
}

export function compare(actual: unknown, op: JsonOp, expectedRaw: string): boolean {
  const expected = unquote(expectedRaw);
  if (op === "exists") return actual !== undefined;
  const a = typeof actual === "object" ? JSON.stringify(actual) : String(actual);
  const na = Number(actual);
  const ne = Number(expected);
  const numeric = actual !== null && actual !== "" && !Number.isNaN(na) && expected !== "" && !Number.isNaN(ne);
  switch (op) {
    case "==":
      return numeric ? na === ne : a === expected;
    case "!=":
      return numeric ? na !== ne : a !== expected;
    case ">":
      return numeric && na > ne;
    case "<":
      return numeric && na < ne;
    case ">=":
      return numeric && na >= ne;
    case "<=":
      return numeric && na <= ne;
    case "contains":
      return a.includes(expected);
  }
  return false;
}

export function checkJson(body: string, path: string, op?: string | null, expected?: string | null): string | null {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return "Response is not valid JSON";
  }
  const a = parseJsonAssertion(path, op, expected);
  let actual: unknown;
  try {
    actual = evalJsonPath(data, a.path);
  } catch (e) {
    return (e as Error).message;
  }
  if (compare(actual, a.op, a.expected)) return null;
  return `JSON assertion failed: ${a.path} ${a.op} ${a.expected} (actual: ${JSON.stringify(actual)})`;
}

export function checkKeyword(body: string, keyword: string, mode: string): string | null {
  const found = body.includes(keyword);
  if (mode === "absent" && found) return `Keyword "${keyword}" was found in the response`;
  if (mode !== "absent" && !found) return `Keyword "${keyword}" was not found in the response`;
  return null;
}
