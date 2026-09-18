export type ChartInformation = {
  id: string;
  name: string;
  source: string | null;
  edition: string | null;
  updateNumber: number;
  issueDate: string | null;
  updateApplicationDate: string | null;
  compilationScale: number | null;
  coveredAreaNames: string[];
  horizontalDatum: number | null;
  soundingDatum: number | null;
  dataQuality: number[];
  surveys: { source: string | null; date: string | null }[];
  processedAt: string | null;
  version: string;
};

const missing = "Not provided";
const date = (value: string | null) => value ? value.slice(0, 10) : missing;
const unique = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => Boolean(v)))].join("; ") || missing;
// S-57 enumerations from GDAL's s57expectedinput.csv. Preserve unknown codes.
const quality: Record<number, string> = { 1: "A1", 2: "A2", 3: "B", 4: "C", 5: "D", 6: "U (not assessed)" };
const horizontalDatum: Record<number, string> = { 1: "WGS 72", 2: "WGS 84" };
const soundingDatum: Record<number, string> = { 3: "Mean sea level", 5: "Mean low water", 12: "Mean lower low water", 23: "Lowest astronomical tide", 24: "Local datum" };
const datum = (code: number | null, labels: Record<number, string>) => code === null ? missing : labels[code] ?? `ENC code ${code}`;

export function chartInformationRows(chart: ChartInformation): [string, string][] {
  return [
    ["Source", chart.source ?? missing],
    ["ENC Cell", chart.name],
    ["Edition", chart.edition ?? missing],
    ["Update Number", String(chart.updateNumber)],
    ["Issue Date", date(chart.issueDate)],
    ["Last Update Applied", date(chart.updateApplicationDate)],
    ["Compilation Scale", chart.compilationScale ? `1:${chart.compilationScale.toLocaleString("en-US")}` : missing],
    ["Coverage", unique(chart.coveredAreaNames)],
    ["Data Quality", chart.dataQuality.length ? chart.dataQuality.map((code) => `CATZOC ${quality[code] ?? code}`).join(", ") : missing],
    ["Horizontal Datum", datum(chart.horizontalDatum, horizontalDatum)],
    ["Sounding Datum", datum(chart.soundingDatum, soundingDatum)],
    ["Survey Source", unique(chart.surveys.map((s) => s.source))],
    ["Survey Date", unique(chart.surveys.map((s) => s.date))],
    ["Processed by MARIS", date(chart.processedAt)],
  ];
}
