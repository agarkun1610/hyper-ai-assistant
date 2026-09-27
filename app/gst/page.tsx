"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import "./gst.css";
import {
  buildStock,
  buildSummary,
  checkInvoice,
  isInvoice,
  isValidGstin,
  rule88dWarning,
  rupees,
  stateOfGstin,
  stockIssues,
  type Entry,
  type Invoice,
  type Issue,
  type Notice,
} from "../../lib/gst";

const ENTRIES_KEY = "gst.entries";
const OWN_GSTIN_KEY = "gst.ownGstin";
const KEY_KEY = "gst.openrouterKey";

type Tab = "capture" | "book" | "stock" | "returns" | "checks";

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function num(value: unknown): number {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Shapes whatever the model returned into a record we are willing to store. */
function normalise(raw: Record<string, unknown>): Entry | null {
  const kind = text(raw.kind).toLowerCase();

  if (kind === "notice") {
    const notice: Notice = {
      id: newId(),
      kind: "notice",
      formType: text(raw.formType).toUpperCase(),
      noticeNumber: text(raw.noticeNumber),
      date: text(raw.date),
      dueDate: text(raw.dueDate),
      period: text(raw.period),
      gstin: text(raw.gstin).toUpperCase(),
      issue: text(raw.issue),
      amount: num(raw.amount),
      capturedAt: new Date().toISOString(),
    };
    return notice;
  }

  if (kind !== "purchase" && kind !== "sale") return null;

  const items = Array.isArray(raw.items) ? raw.items : [];

  const invoice: Invoice = {
    id: newId(),
    kind,
    invoiceNumber: text(raw.invoiceNumber),
    date: text(raw.date),
    partyName: text(raw.partyName),
    partyGstin: text(raw.partyGstin).toUpperCase(),
    items: items.map((entry) => {
      const item = (entry ?? {}) as Record<string, unknown>;
      return {
        description: text(item.description),
        quantity: num(item.quantity),
        unit: text(item.unit) || "nos",
        gstRate: num(item.gstRate),
        taxableValue: num(item.taxableValue),
      };
    }),
    taxableValue: num(raw.taxableValue),
    cgst: num(raw.cgst),
    sgst: num(raw.sgst),
    igst: num(raw.igst),
    total: num(raw.total),
    capturedAt: new Date().toISOString(),
  };

  return invoice;
}

export default function GstPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [ownGstin, setOwnGstin] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [tab, setTab] = useState<Tab>("capture");
  const [image, setImage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Entry | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ENTRIES_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) setEntries(parsed as Entry[]);
      }
    } catch {
      // A corrupt store must not stop the app opening.
    }
    setOwnGstin(window.localStorage.getItem(OWN_GSTIN_KEY) ?? "");
    const key = window.localStorage.getItem(KEY_KEY) ?? "";
    setApiKey(key);
    setKeyDraft(key);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
    } catch {
      // Storage may be full; the session still works in memory.
    }
  }, [entries]);

  const invoices = useMemo(() => entries.filter(isInvoice), [entries]);
  const notices = useMemo(
    () => entries.filter((entry): entry is Notice => entry.kind === "notice"),
    [entries],
  );
  const stock = useMemo(() => buildStock(invoices), [invoices]);
  const summary = useMemo(() => buildSummary(invoices), [invoices]);

  const issues = useMemo(() => {
    const found: Array<Issue & { ref: string }> = [];

    for (const invoice of invoices) {
      for (const issue of checkInvoice(invoice, invoices, ownGstin)) {
        found.push({
          ...issue,
          ref: `${invoice.kind === "sale" ? "Sale" : "Purchase"} ${invoice.invoiceNumber || "(no number)"}`,
        });
      }
    }

    for (const issue of stockIssues(stock)) {
      found.push({ ...issue, ref: "Stock" });
    }

    const rule88d = rule88dWarning(summary);
    if (rule88d) found.push({ ...rule88d, ref: "Input tax credit" });

    return found.sort((a, b) =>
      a.level === b.level ? 0 : a.level === "error" ? -1 : 1,
    );
  }, [invoices, stock, summary, ownGstin]);

  function saveOwnGstin(value: string) {
    const upper = value.toUpperCase();
    setOwnGstin(upper);
    window.localStorage.setItem(OWN_GSTIN_KEY, upper);
  }

  function saveKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = keyDraft.trim();
    window.localStorage.setItem(KEY_KEY, trimmed);
    setApiKey(trimmed);
    setShowKey(false);
  }

  function pickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    setDraft(null);

    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result ?? ""));
    reader.onerror = () => setError("That image could not be opened.");
    reader.readAsDataURL(file);
  }

  async function readDocument() {
    if (!image || busy) return;

    setBusy(true);
    setError("");
    setDraft(null);

    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, apiKey: apiKey || undefined }),
      });

      const data: { extracted?: Record<string, unknown>; error?: string } =
        await response.json();

      if (!response.ok) throw new Error(data.error ?? "The read failed.");

      const entry = data.extracted ? normalise(data.extracted) : null;
      if (!entry) throw new Error("This did not look like an invoice or notice.");

      setDraft(entry);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something failed.");
    } finally {
      setBusy(false);
    }
  }

  function commitDraft() {
    if (!draft) return;
    setEntries((current) => [draft, ...current]);
    setDraft(null);
    setImage("");
    if (fileRef.current) fileRef.current.value = "";
    setTab("checks");
  }

  function remove(id: string) {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }

  function patchDraft(patch: Partial<Invoice>) {
    setDraft((current) =>
      current && isInvoice(current) ? { ...current, ...patch } : current,
    );
  }

  const errorCount = issues.filter((issue) => issue.level === "error").length;

  return (
    <main className="gst">
      <div className="gst-head">
        <h1>Dukaan books</h1>
        <button
          className="gst-btn ghost"
          type="button"
          onClick={() => setShowKey((open) => !open)}
        >
          Key
        </button>
      </div>
      <p className="gst-sub">
        Photograph a bill or a notice. The figures are read for you, then
        checked against the GST rules before they reach your books.
      </p>

      {showKey ? (
        <form className="gst-card" onSubmit={saveKey}>
          <label className="gst-label" htmlFor="ownGstin">
            Your GSTIN
          </label>
          <input
            id="ownGstin"
            className="gst-input"
            value={ownGstin}
            onChange={(event) => saveOwnGstin(event.target.value)}
            placeholder="29ABCDE1234F1Z5"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="gst-muted" style={{ margin: "6px 0 14px" }}>
            {ownGstin
              ? isValidGstin(ownGstin)
                ? `Valid. ${stateOfGstin(ownGstin)}.`
                : "This GSTIN fails its check digit."
              : "Needed to tell an intra-state supply from an inter-state one."}
          </p>

          <label className="gst-label" htmlFor="key">
            OpenRouter key
          </label>
          <div className="gst-row">
            <input
              id="key"
              className="gst-input"
              style={{ flex: 1, minWidth: 180 }}
              type="password"
              value={keyDraft}
              onChange={(event) => setKeyDraft(event.target.value)}
              placeholder="sk-or-..."
              autoComplete="off"
              spellCheck={false}
            />
            <button className="gst-btn" type="submit">
              Save
            </button>
          </div>
          <p className="gst-muted" style={{ marginTop: 6 }}>
            Reading a photograph needs a model that can see. Stored in this
            browser only.
          </p>
        </form>
      ) : null}

      <div className="gst-tabs">
        {(
          [
            ["capture", "Capture"],
            ["book", `Book (${entries.length})`],
            ["stock", `Stock (${stock.length})`],
            ["returns", "Returns"],
            ["checks", `Checks${errorCount ? ` (${errorCount})` : ""}`],
          ] as Array<[Tab, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`gst-tab ${tab === value ? "on" : ""}`}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "capture" ? (
        <div className="gst-card">
          <input
            ref={fileRef}
            className="gst-input"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={pickFile}
          />

          {image ? (
            <img className="gst-preview" src={image} alt="Document to read" />
          ) : null}

          <div className="gst-row" style={{ marginTop: 12 }}>
            <button
              className="gst-btn"
              type="button"
              onClick={readDocument}
              disabled={!image || busy}
            >
              {busy ? "Reading" : "Read document"}
            </button>
            {image ? (
              <button
                className="gst-btn ghost"
                type="button"
                onClick={() => {
                  setImage("");
                  setDraft(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                Clear
              </button>
            ) : null}
          </div>

          {error ? <p className="gst-err">{error}</p> : null}

          {draft && isInvoice(draft) ? (
            <div style={{ marginTop: 16 }}>
              <p className="gst-label">
                Check before saving — correct anything misread
              </p>
              <div className="gst-grid">
                <div>
                  <label className="gst-label">Invoice number</label>
                  <input
                    className="gst-input"
                    value={draft.invoiceNumber}
                    onChange={(event) =>
                      patchDraft({ invoiceNumber: event.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="gst-label">Date</label>
                  <input
                    className="gst-input"
                    value={draft.date}
                    onChange={(event) => patchDraft({ date: event.target.value })}
                  />
                </div>
                <div>
                  <label className="gst-label">Party</label>
                  <input
                    className="gst-input"
                    value={draft.partyName}
                    onChange={(event) =>
                      patchDraft({ partyName: event.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="gst-label">Party GSTIN</label>
                  <input
                    className="gst-input"
                    value={draft.partyGstin}
                    onChange={(event) =>
                      patchDraft({
                        partyGstin: event.target.value.toUpperCase(),
                      })
                    }
                  />
                </div>
              </div>

              <div className="gst-line" style={{ marginTop: 12 }}>
                <span>
                  {draft.kind === "sale" ? "Sale" : "Purchase"} ·{" "}
                  {draft.items.length} item
                  {draft.items.length === 1 ? "" : "s"}
                </span>
                <b>{rupees(draft.total)}</b>
              </div>
              <div className="gst-line">
                <span className="gst-muted">
                  Taxable {rupees(draft.taxableValue)} · CGST{" "}
                  {rupees(draft.cgst)} · SGST {rupees(draft.sgst)} · IGST{" "}
                  {rupees(draft.igst)}
                </span>
              </div>

              <button
                className="gst-btn"
                type="button"
                style={{ marginTop: 12 }}
                onClick={commitDraft}
              >
                Save to book
              </button>
            </div>
          ) : null}

          {draft && draft.kind === "notice" ? (
            <div style={{ marginTop: 16 }}>
              <p className="gst-label">Notice read</p>
              <div className="gst-line">
                <span>Form</span>
                <b>{draft.formType || "not stated"}</b>
              </div>
              <div className="gst-line">
                <span>Period</span>
                <b>{draft.period || "not stated"}</b>
              </div>
              <div className="gst-line">
                <span>Reply due</span>
                <b>{draft.dueDate || "not stated"}</b>
              </div>
              {draft.amount > 0 ? (
                <div className="gst-line">
                  <span>Amount in question</span>
                  <b>{rupees(draft.amount)}</b>
                </div>
              ) : null}
              <p className="gst-muted" style={{ marginTop: 8 }}>
                {draft.issue}
              </p>
              <button
                className="gst-btn"
                type="button"
                style={{ marginTop: 12 }}
                onClick={commitDraft}
              >
                Save to book
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "book" ? (
        <div className="gst-card">
          {entries.length === 0 ? (
            <p className="gst-empty">Nothing recorded yet.</p>
          ) : (
            entries.map((entry) => (
              <div className="gst-line" key={entry.id}>
                <span>
                  <span
                    className={`gst-pill ${entry.kind === "sale" ? "sale" : entry.kind === "notice" ? "notice" : ""}`}
                  >
                    {entry.kind}
                  </span>{" "}
                  {isInvoice(entry)
                    ? `${entry.partyName || "Unnamed"} · ${entry.invoiceNumber || "no number"}`
                    : `${entry.formType || "Notice"} · ${entry.period || "period not stated"}`}
                  <br />
                  <span className="gst-muted">{entry.date || "undated"}</span>
                </span>
                <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <b>
                    {rupees(isInvoice(entry) ? entry.total : entry.amount)}
                  </b>
                  <br />
                  <button
                    className="gst-btn danger"
                    type="button"
                    style={{ padding: "4px 9px", fontSize: "0.75rem" }}
                    onClick={() => remove(entry.id)}
                  >
                    Delete
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === "stock" ? (
        <div className="gst-card">
          {stock.length === 0 ? (
            <p className="gst-empty">
              Stock builds itself as you photograph purchase and sale bills.
            </p>
          ) : (
            stock.map((row) => (
              <div className="gst-line" key={row.item}>
                <span>
                  {row.item}
                  <br />
                  <span className="gst-muted">
                    In {row.purchased} · Out {row.sold} {row.unit}
                  </span>
                </span>
                <b style={{ color: row.balance < 0 ? "#c53a3a" : undefined }}>
                  {row.balance} {row.unit}
                </b>
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === "returns" ? (
        <div className="gst-card">
          <div className="gst-line">
            <span>Outward taxable value</span>
            <b>{rupees(summary.outwardTaxable)}</b>
          </div>
          <div className="gst-line">
            <span>Output tax</span>
            <b>{rupees(summary.outputTax)}</b>
          </div>
          <div className="gst-line">
            <span>Inward taxable value</span>
            <b>{rupees(summary.inwardTaxable)}</b>
          </div>
          <div className="gst-line">
            <span>Credit that looks safe to claim</span>
            <b>{rupees(summary.eligibleItc)}</b>
          </div>
          <div className="gst-line">
            <span>Credit at risk</span>
            <b style={{ color: summary.blockedItc > 0 ? "#c53a3a" : undefined }}>
              {rupees(summary.blockedItc)}
            </b>
          </div>
          <div className="gst-line">
            <span>
              <b>Net tax payable</b>
            </span>
            <b>{rupees(summary.netPayable)}</b>
          </div>
          <p className="gst-muted" style={{ marginTop: 10 }}>
            A working figure from the bills you have photographed, not a filed
            return. Compare it against your GSTR-2B before paying.
          </p>

          {notices.length > 0 ? (
            <>
              <p className="gst-label" style={{ marginTop: 16 }}>
                Notices on record
              </p>
              {notices.map((notice) => (
                <div className="gst-line" key={notice.id}>
                  <span>
                    <b>{notice.formType || "Notice"}</b>
                    <br />
                    <span className="gst-muted">{notice.issue}</span>
                  </span>
                  <span style={{ whiteSpace: "nowrap" }}>
                    due {notice.dueDate || "?"}
                  </span>
                </div>
              ))}
            </>
          ) : null}
        </div>
      ) : null}

      {tab === "checks" ? (
        <div className="gst-card">
          {issues.length === 0 ? (
            <p className="gst-empty">
              {invoices.length === 0
                ? "Nothing to check yet."
                : "Nothing wrong found in what you have recorded."}
            </p>
          ) : (
            issues.map((issue, index) => (
              <div
                className={`gst-issue ${issue.level}`}
                key={`${issue.code}-${index}`}
              >
                <strong>
                  {issue.ref} — {issue.message}
                </strong>
                <span>{issue.action}</span>
              </div>
            ))
          )}
        </div>
      ) : null}
    </main>
  );
}
