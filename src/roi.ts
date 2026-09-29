export interface RoiInputs {
  ordersPerMonth: number;
  percentManual: number;
  minutesSavedPerOrder: number;
  dollarsPerMinute: number;
  reprintPct: number;
  costPerReprint: number;
  capturePct: number;
}

export interface RoiAssumption {
  key: keyof RoiInputs;
  label: string;
  range: string;
  weakest: boolean;
}

export const WEAKEST_ROI_INPUT: keyof RoiInputs = "ordersPerMonth";

export function defaultRoiInputs(): RoiInputs {
  return {
    ordersPerMonth: 100_000,
    percentManual: 55,
    minutesSavedPerOrder: 11.5,
    dollarsPerMinute: 0.6,
    reprintPct: 2,
    costPerReprint: 26.5,
    capturePct: 22.5,
  };
}

export function roiAssumptions(): RoiAssumption[] {
  return [
    { key: "ordersPerMonth", label: "Orders per month (assumed)", range: "80k to 150k", weakest: true },
    { key: "percentManual", label: "Percent manual (assumed)", range: "40 to 70%", weakest: false },
    { key: "minutesSavedPerOrder", label: "Minutes saved per order (assumed)", range: "8 to 15 min", weakest: false },
    { key: "dollarsPerMinute", label: "Loaded dollars per minute (assumed)", range: "$0.45 to $0.75", weakest: false },
    { key: "reprintPct", label: "Reprint percent (assumed)", range: "1 to 3%", weakest: false },
    { key: "costPerReprint", label: "Cost per reprint (assumed)", range: "$18 to $35", weakest: false },
    { key: "capturePct", label: "Year-one capture (assumed)", range: "20 to 25%", weakest: false },
  ];
}

export interface RoiResult {
  laborMonthly: number;
  reprintMonthly: number;
  grossMonthly: number;
  capturedMonthly: number;
  capturedAnnual: number;
}

function requireFinite(name: string, v: number): void {
  if (!Number.isFinite(v) || v < 0) throw new Error(`roi input ${name} must be >= 0`);
}

export function computeRoi(inputs: RoiInputs): RoiResult {
  for (const [k, v] of Object.entries(inputs)) requireFinite(k, v as number);
  const laborMonthly =
    inputs.ordersPerMonth *
    (inputs.percentManual / 100) *
    inputs.minutesSavedPerOrder *
    inputs.dollarsPerMinute;
  const reprintMonthly =
    inputs.ordersPerMonth * (inputs.reprintPct / 100) * inputs.costPerReprint;
  const grossMonthly = laborMonthly + reprintMonthly;
  const capturedMonthly = grossMonthly * (inputs.capturePct / 100);
  return {
    laborMonthly,
    reprintMonthly,
    grossMonthly,
    capturedMonthly,
    capturedAnnual: capturedMonthly * 12,
  };
}
