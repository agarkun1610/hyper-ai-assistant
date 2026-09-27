/**
 * Deterministic GST rules.
 *
 * Nothing here calls a model. Extraction from an image is probabilistic and
 * belongs upstream; every judgement that could cost a retailer money is made
 * with arithmetic that can be checked by hand and explained in a sentence.
 */

export type DocKind = "purchase" | "sale" | "notice";

export type LineItem = {
  description: string;
  quantity: number;
  unit: string;
  gstRate: number;
  taxableValue: number;
};

export type Invoice = {
  id: string;
  kind: "purchase" | "sale";
  invoiceNumber: string;
  date: string;
  partyName: string;
  partyGstin: string;
  items: LineItem[];
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  capturedAt: string;
};

export type Notice = {
  id: string;
  kind: "notice";
  formType: string;
  noticeNumber: string;
  date: string;
  dueDate: string;
  period: string;
  gstin: string;
  issue: string;
  amount: number;
  capturedAt: string;
};

export type Entry = Invoice | Notice;

export type Issue = {
  level: "error" | "warning";
  code: string;
  message: string;
  action: string;
};

const GSTIN_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export const STATE_CODES: Record<string, string> = {
  "01": "Jammu & Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra & Nagar Haveli and Daman & Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman & Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
};

/**
 * Validates a GSTIN's structure and its check digit.
 *
 * The check digit is a weighted modulus over the first fourteen characters,
 * so a single mistyped or misread character is caught here rather than by the
 * department months later.
 */
export function isValidGstin(raw: string): boolean {
  const gstin = (raw || "").trim().toUpperCase();
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
    return false;
  }
  if (!STATE_CODES[gstin.slice(0, 2)]) return false;

  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const value = GSTIN_ALPHABET.indexOf(gstin[i]);
    if (value < 0) return false;
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  const expected = GSTIN_ALPHABET[(36 - (sum % 36)) % 36];
  return expected === gstin[14];
}

export function stateOfGstin(gstin: string): string | null {
  const code = (gstin || "").trim().slice(0, 2);
  return STATE_CODES[code] ?? null;
}

export function rupees(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function near(a: number, b: number, tolerance = 1): boolean {
  return Math.abs(a - b) <= tolerance;
}

export function isInvoice(entry: Entry): entry is Invoice {
  return entry.kind === "purchase" || entry.kind === "sale";
}

/**
 * Checks one invoice against the others already recorded.
 *
 * `ownGstin` is the retailer's own number: the place of supply comparison,
 * and therefore which tax heads are correct, depends on it.
 */
export function checkInvoice(
  invoice: Invoice,
  all: Invoice[],
  ownGstin: string,
): Issue[] {
  const issues: Issue[] = [];
  const { cgst, sgst, igst, taxableValue, total } = invoice;

  if (!invoice.partyGstin) {
    issues.push({
      level: invoice.kind === "purchase" ? "error" : "warning",
      code: "gstin-missing",
      message: "No GSTIN was read for this party.",
      action:
        invoice.kind === "purchase"
          ? "Input tax credit cannot be claimed without the supplier's GSTIN. Enter it before filing."
          : "Add the buyer's GSTIN if this was a B2B sale.",
    });
  } else if (!isValidGstin(invoice.partyGstin)) {
    issues.push({
      level: "error",
      code: "gstin-invalid",
      message: `${invoice.partyGstin} fails the GSTIN check digit.`,
      action:
        "Re-read the number from the invoice. A wrong GSTIN means the credit will not appear in your GSTR-2B.",
    });
  }

  const ownState = stateOfGstin(ownGstin);
  const partyState = stateOfGstin(invoice.partyGstin);

  if (ownState && partyState) {
    const intraState = ownState === partyState;

    if (intraState && igst > 0) {
      issues.push({
        level: "error",
        code: "tax-head-igst",
        message: `Both parties are in ${ownState}, but IGST of ${rupees(igst)} has been charged.`,
        action:
          "An intra-state supply takes CGST and SGST. Ask the supplier for a corrected invoice.",
      });
    }

    if (!intraState && (cgst > 0 || sgst > 0)) {
      issues.push({
        level: "error",
        code: "tax-head-cgst-sgst",
        message: `This is a supply between ${partyState} and ${ownState}, but CGST and SGST have been charged.`,
        action:
          "An inter-state supply takes IGST. Credit claimed under the wrong head will be reversed.",
      });
    }
  }

  if (cgst > 0 && sgst > 0 && !near(cgst, sgst)) {
    issues.push({
      level: "error",
      code: "cgst-sgst-unequal",
      message: `CGST ${rupees(cgst)} does not equal SGST ${rupees(sgst)}.`,
      action: "These two are always equal. One of the figures has been misread.",
    });
  }

  const statedTax = cgst + sgst + igst;
  const expectedTax = invoice.items.reduce(
    (running, item) => running + (item.taxableValue * item.gstRate) / 100,
    0,
  );

  if (invoice.items.length > 0 && !near(statedTax, expectedTax, 2)) {
    issues.push({
      level: "warning",
      code: "tax-arithmetic",
      message: `Tax on the invoice is ${rupees(statedTax)}, but the line items work out to ${rupees(expectedTax)}.`,
      action:
        "Check the rate on each line. A difference here is the most common reason returns stop matching.",
    });
  }

  if (!near(taxableValue + statedTax, total, 2)) {
    issues.push({
      level: "warning",
      code: "total-mismatch",
      message: `Taxable value plus tax is ${rupees(taxableValue + statedTax)}, but the invoice total reads ${rupees(total)}.`,
      action: "Re-check the figures before this goes into your books.",
    });
  }

  const duplicate = all.find(
    (other) =>
      other.id !== invoice.id &&
      other.kind === invoice.kind &&
      other.invoiceNumber.trim().toUpperCase() ===
        invoice.invoiceNumber.trim().toUpperCase() &&
      other.partyGstin.trim().toUpperCase() ===
        invoice.partyGstin.trim().toUpperCase(),
  );

  if (duplicate) {
    issues.push({
      level: "error",
      code: "duplicate",
      message: `Invoice ${invoice.invoiceNumber} from this party has already been recorded.`,
      action:
        "Recording it twice inflates your credit and is exactly what the department's matching picks up. Delete one.",
    });
  }

  return issues;
}

export type StockRow = {
  item: string;
  unit: string;
  purchased: number;
  sold: number;
  balance: number;
};

export function buildStock(invoices: Invoice[]): StockRow[] {
  const rows = new Map<string, StockRow>();

  for (const invoice of invoices) {
    for (const item of invoice.items) {
      const key = item.description.trim().toLowerCase();
      if (!key) continue;

      const row =
        rows.get(key) ??
        ({
          item: item.description.trim(),
          unit: item.unit || "nos",
          purchased: 0,
          sold: 0,
          balance: 0,
        } satisfies StockRow);

      if (invoice.kind === "purchase") row.purchased += item.quantity;
      else row.sold += item.quantity;

      row.balance = row.purchased - row.sold;
      rows.set(key, row);
    }
  }

  return [...rows.values()].sort((a, b) => a.item.localeCompare(b.item));
}

export function stockIssues(rows: StockRow[]): Issue[] {
  return rows
    .filter((row) => row.balance < 0)
    .map((row) => ({
      level: "error" as const,
      code: "negative-stock",
      message: `${row.item}: ${row.sold} sold against ${row.purchased} purchased.`,
      action:
        "You cannot sell stock you never bought. Either a purchase bill has not been entered, or a sale has been recorded twice.",
    }));
}

export type GstSummary = {
  outwardTaxable: number;
  outputTax: number;
  inwardTaxable: number;
  eligibleItc: number;
  blockedItc: number;
  netPayable: number;
};

export function buildSummary(invoices: Invoice[]): GstSummary {
  let outwardTaxable = 0;
  let outputTax = 0;
  let inwardTaxable = 0;
  let eligibleItc = 0;
  let blockedItc = 0;

  for (const invoice of invoices) {
    const tax = invoice.cgst + invoice.sgst + invoice.igst;

    if (invoice.kind === "sale") {
      outwardTaxable += invoice.taxableValue;
      outputTax += tax;
      continue;
    }

    inwardTaxable += invoice.taxableValue;
    if (isValidGstin(invoice.partyGstin)) eligibleItc += tax;
    else blockedItc += tax;
  }

  return {
    outwardTaxable,
    outputTax,
    inwardTaxable,
    eligibleItc,
    blockedItc,
    netPayable: Math.max(0, outputTax - eligibleItc),
  };
}

/**
 * Rule 88D: where credit taken in GSTR-3B exceeds what GSTR-2B makes
 * available by more than one lakh rupees or twenty per cent, the portal
 * raises a DRC-01C on its own. Warning before that threshold is the whole
 * point of this app.
 */
export function rule88dWarning(summary: GstSummary): Issue | null {
  const { blockedItc, eligibleItc } = summary;
  if (blockedItc <= 0) return null;

  const available = eligibleItc || 1;
  const overLimit = blockedItc > 100000 || blockedItc / available > 0.2;

  return {
    level: overLimit ? "error" : "warning",
    code: "rule-88d",
    message: overLimit
      ? `${rupees(blockedItc)} of credit rests on invoices with an unusable GSTIN. That is past the Rule 88D threshold.`
      : `${rupees(blockedItc)} of credit rests on invoices with an unusable GSTIN.`,
    action: overLimit
      ? "Claiming this in GSTR-3B auto-generates a DRC-01C. Fix the GSTINs or drop the credit before you file."
      : "Fix these GSTINs so the credit is safe to claim.",
  };
}
