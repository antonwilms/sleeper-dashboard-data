/**
 * lib/registry.mjs — field-block parser for the cross-repo contract registry
 * (the `<!-- CR-REGISTRY-BEGIN -->` … `<!-- CR-REGISTRY-END -->` region of README.md,
 * mirrored byte-for-byte in the app repo's docs/cross-repo-registry.md).
 *
 * Pure text-in/data-out — no filesystem access. Callers pass in already-read text.
 *
 * Block-scoped, not line-scoped: a field's value is its `- **<Field>:**` line PLUS every
 * indented continuation line that follows it, up to the next field/entry/blank line. This
 * is required to correctly parse CR-19, the only entry whose App side/Data side/Triggers
 * wrap onto indented continuation lines (anchor-policy.md §3.3) — a line-scoped parser
 * either misses its wrapped anchors or, if naively extended to "also read continuations",
 * eats the six frozen App-side anchors sharing that same wrap.
 */

export const REGISTRY_BEGIN = '<!-- CR-REGISTRY-BEGIN -->';
export const REGISTRY_END = '<!-- CR-REGISTRY-END -->';

/** Extract the sentinel-delimited region (inclusive) from a full file's text. */
export function extractRegistryRegion(text) {
  const startIdx = text.indexOf(REGISTRY_BEGIN);
  const endIdx = text.indexOf(REGISTRY_END);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('registry sentinels not found in text');
  }
  return text.slice(startIdx, endIdx + REGISTRY_END.length);
}

const ENTRY_RE = /^#### (CR-\d+)/;
const FIELD_RE = /^- \*\*([^*]+?):\*\*\s?(.*)$/;

/**
 * Parse the registry region into entries, each `{ id, fields: { [fieldName]: blockText } }`.
 * blockText is the field's own line's trailing text plus every continuation line, newline-joined.
 * Only text after `#### CR-NN` headers is considered — the leading "Entry format" example
 * block (which also contains `- **App side:**`-shaped lines inside a fenced code block) is
 * skipped because no entry is open yet when those lines are seen.
 */
export function parseEntries(regionText) {
  const lines = regionText.split('\n');
  const entries = [];
  let current = null;
  let currentField = null;
  let fieldLines = [];

  function flushField() {
    if (current && currentField !== null) {
      current.fields[currentField] = fieldLines.join('\n').trim();
    }
    fieldLines = [];
  }

  for (const line of lines) {
    const entryMatch = line.match(ENTRY_RE);
    if (entryMatch) {
      flushField();
      current = { id: entryMatch[1], fields: {} };
      entries.push(current);
      currentField = null;
      continue;
    }
    if (!current) continue;

    const fieldMatch = line.match(FIELD_RE);
    if (fieldMatch) {
      flushField();
      currentField = fieldMatch[1].trim();
      fieldLines = [fieldMatch[2]];
      continue;
    }

    // Continuation line: indented, non-blank, belongs to the currently open field.
    if (currentField !== null && /^\s+\S/.test(line)) {
      fieldLines.push(line.trim());
      continue;
    }

    // Blank line or an unindented non-field line closes the open field (but not the entry —
    // the next field line will open a new one; a truly new entry is caught by ENTRY_RE above).
    if (currentField !== null) {
      flushField();
      currentField = null;
    }
  }
  flushField();
  return entries;
}

/**
 * Split a Triggers field's block text at the FIRST `‖` in the whole block (not the first
 * line) — required for CR-19, whose `‖` sits mid-continuation.
 */
export function splitTriggers(triggersText) {
  if (!triggersText) return { app: '', data: '' };
  const idx = triggersText.indexOf('‖');
  if (idx === -1) return { app: triggersText, data: '' };
  return { app: triggersText.slice(0, idx), data: triggersText.slice(idx + 1) };
}

/**
 * Anchor occurrences: backtick spans containing a colon immediately followed by a digit,
 * optionally continuing through digits/commas/dashes (covers `symbol:NNN`, `file.ext:NNN`,
 * bare `:NNN`, ranges `:NNN-NNN`, comma lists `:87,93,148,157`). A regex requiring a leading
 * identifier before the colon misses the bare-`:NNN` and range/list forms.
 */
const ANCHOR_SPAN_RE = /`[^`]*:\d[\d,-]*[^`]*`/g;

export function countAnchors(text) {
  if (!text) return 0;
  const matches = text.match(ANCHOR_SPAN_RE);
  return matches ? matches.length : 0;
}

/** Data-side text for one entry: the Data side field plus the data half of Triggers. */
export function dataSideText(entry) {
  const dataSideField = entry.fields['Data side'] ?? '';
  const { data: triggersData } = splitTriggers(entry.fields['Triggers'] ?? '');
  return `${dataSideField}\n${triggersData}`;
}

/** App-side text for one entry: the App side field plus the app half of Triggers. */
export function appSideText(entry) {
  const appSideField = entry.fields['App side'] ?? '';
  const { app: triggersApp } = splitTriggers(entry.fields['Triggers'] ?? '');
  return `${appSideField}\n${triggersApp}`;
}

/** Total data-side / app-side cache-field anchor counts across all entries. */
export function countCacheFieldAnchors(entries) {
  let dataSide = 0;
  let appSide = 0;
  for (const entry of entries) {
    dataSide += countAnchors(dataSideText(entry));
    appSide += countAnchors(appSideText(entry));
  }
  return { dataSide, appSide };
}

/**
 * Backtick spans that look like a file/path/glob/template/generic-loop reference rather
 * than a plain symbol — used by the recurrence-guard test to skip spec-authorized
 * non-symbol trigger forms (served-path templates, globs, brace expansions, the generic
 * sum-loop trigger, prose literals like `idp_*`/`TEAM_*`/`inProgress`).
 */
export function isFileLikeSpan(span) {
  return /[\/.]/.test(span) || /[<>*{}()]/.test(span);
}

/** A bare-identifier span: letters/digits/underscore/dollar only, starting with a letter/underscore/$. */
export function isPlainIdentifierSpan(span) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(span);
}

/** A concrete, resolvable repo-relative file path span (no glob/template/brace-expansion chars). */
export function isConcreteFileSpan(span) {
  return /^[\w./-]+\.(mjs|js|json|md)$/.test(span) && !/[<>*{}]/.test(span);
}

/**
 * A span that "claims to be a symbol" a live source file could define — as opposed to a
 * prose literal, stat key, or JSON field name quoted for readability (`idp_*`, `pass_cmp`,
 * `team`, `inProgress` used as a plain-English noun, `Invariant` in a self-reference). Real
 * code symbols in this codebase are always camelCase/PascalCase (with an interior
 * capital — not just an initial one) or SCREAMING_SNAKE_CASE; prose backticks that happen
 * to be identifier-shaped are all-lowercase or a single capitalized word with no interior
 * capital. This is a heuristic, not a parser — it exists to skip spec-authorized non-symbol
 * forms (§5's design constraint 1), not to catch every code symbol ever quoted.
 */
export function isCodeSymbolSpan(span) {
  if (!isPlainIdentifierSpan(span)) return false;
  if (/^[a-z][a-z0-9_]*$/.test(span)) return false;              // all-lowercase -> prose/stat-key
  if (/^[A-Z][A-Z0-9_]*$/.test(span)) {
    return span.length >= 2 && !/^_|_$/.test(span);              // SCREAMING_SNAKE_CASE constant
  }
  return /[A-Z]/.test(span.slice(1));                             // interior capital -> camelCase/PascalCase
}

const SEPARATOR_CHAIN_RE = /^\s*[\/,]\s*(and\s+)?$/;
const REVERSE_CONNECTOR_RE = /^\s+in\s+(the\s+)?$/;
const ADJACENT_SEP_RE = /^('s)?[\s(]*$/;

/**
 * Extract {symbols, file} claims from a data-side text blob: which symbols the entry
 * asserts live in which file. Two supported forms, both seen throughout the registry:
 *   - forward: `` `file.mjs` (`symA`, `symB`) `` — file token, then a run of symbol tokens
 *   - reverse: `` `symA` / `symB` in `file.mjs` `` — a run of symbol tokens, then "in `file`"
 * A symbol run with neither an adjacent preceding file token nor a following "in `file`"
 * falls back to the nearest preceding file token seen anywhere earlier in the text
 * (forward-context) — the common case of a file named once, then several symbols listed
 * across the same sentence. A run with no file context at all is returned with `file: null`
 * and the caller skips it — resolving against "the whole tree" is exactly what §5.2 forbids.
 */
export function extractSymbolFileClaims(text) {
  const spanRe = /`([^`]+)`/g;
  const tokens = [];
  let m;
  let lastEnd = 0;
  while ((m = spanRe.exec(text))) {
    const sep = text.slice(lastEnd, m.index);
    const content = m[1];
    let type = null;
    if (isConcreteFileSpan(content)) type = 'file';
    else if (isCodeSymbolSpan(content)) type = 'symbol';
    if (type) tokens.push({ type, value: content, sep });
    lastEnd = spanRe.lastIndex;
  }

  const claims = [];
  let currentFile = null;
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.type === 'file') {
      currentFile = tok.value;
      i++;
      continue;
    }
    // symbol run: this token plus any immediately-chained symbol tokens after it
    const run = [tok];
    let j = i + 1;
    while (j < tokens.length && tokens[j].type === 'symbol' && SEPARATOR_CHAIN_RE.test(tokens[j].sep)) {
      run.push(tokens[j]);
      j++;
    }
    const nextTok = j < tokens.length ? tokens[j] : null;
    const prevTok = i > 0 ? tokens[i - 1] : null;

    if (nextTok && nextTok.type === 'file' && REVERSE_CONNECTOR_RE.test(nextTok.sep)) {
      for (const t of run) claims.push({ symbol: t.value, file: nextTok.value });
      i = j + 1;
      continue;
    }
    if (prevTok && prevTok.type === 'file' && ADJACENT_SEP_RE.test(tok.sep)) {
      for (const t of run) claims.push({ symbol: t.value, file: prevTok.value });
      i = j;
      continue;
    }
    for (const t of run) claims.push({ symbol: t.value, file: currentFile });
    i = j;
  }
  return claims;
}

/** Whole-word match: does `symbol` appear anywhere in `source`? (declaration or reference.) */
export function symbolResolvesIn(symbol, source) {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`).test(source);
}
