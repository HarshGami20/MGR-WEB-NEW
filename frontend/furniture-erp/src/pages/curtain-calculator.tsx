import { useCallback, useState } from "react";
import { Download, Pencil } from "lucide-react";
import type { TDocumentDefinitions } from "pdfmake/interfaces";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { formatInr } from "@/lib/format-currency";

/** INR with paise, matching the standalone HTML quotation rows. */
function formatInrDetail(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
import { downloadPdfDocument } from "@/lib/pdfmake-client";
import { cn } from "@/lib/utils";

type Quotation3Fold = {
  partyName: string;
  parts: number;
  fabricMeters: number;
  fabricCost: number;
  labourCost: number;
  channelFeetRounded: number;
  channelCost: number;
  fittingCost: number;
  totalCost: number;
};

type ResultRoman = {
  partyName: string;
  totalFabric: number;
  sqft: number;
  labourCost: number;
  fabricCost: number;
  fitting: number;
  total: number;
};

const pdfStyles = {
  logoHeader: { fontSize: 28, bold: true, alignment: "center" as const, font: "Roboto" },
  subHeader: { fontSize: 9, alignment: "center" as const, letterSpacing: 3, margin: [0, 0, 0, 10] as [number, number, number, number] },
  header: { fontSize: 18, bold: true, alignment: "center" as const, margin: [0, 10, 0, 10] as [number, number, number, number] },
};

function computeQuotation3Fold(input: {
  partyName: string;
  lengthIn: string;
  heightIn: string;
  fabricRate: string;
  channelRate: string;
  fittingCost: string;
  labourCostPerPart: number;
}): Quotation3Fold | null {
  const party = input.partyName.trim() || "N/A";
  const length = parseFloat(input.lengthIn);
  const height = parseFloat(input.heightIn);
  const fabric = parseFloat(input.fabricRate);
  const channel = parseFloat(input.channelRate);
  const fitting = parseFloat(input.fittingCost);
  if (isNaN(length) || isNaN(height) || isNaN(fabric)) return null;

  const parts = Math.ceil(length / 20);
  const fabricMeters = ((height + 10) * parts) / 39;
  const fabricCost = fabricMeters * fabric;
  const labourCost = input.labourCostPerPart * parts;
  const channelFeetRounded = Math.ceil((length / 12) * 2) / 2;
  const channelCost = (isNaN(channel) ? 0 : channel) * channelFeetRounded;
  const fit = isNaN(fitting) ? 0 : fitting;
  const totalCost = fabricCost + labourCost + channelCost + fit;

  return {
    partyName: party,
    parts,
    fabricMeters,
    fabricCost,
    labourCost,
    channelFeetRounded,
    channelCost,
    fittingCost: fit,
    totalCost,
  };
}

function computeRoman(input: {
  partyName: string;
  lengthRoman: string;
  heightRoman: string;
  fabricPriceRoman: string;
  fittingChargeRoman: string;
  labourRateRoman: number;
}): ResultRoman | null {
  const party = input.partyName.trim() || "N/A";
  const length = parseFloat(input.lengthRoman);
  const height = parseFloat(input.heightRoman);
  const fabricPrice = parseFloat(input.fabricPriceRoman);
  const fitting = parseFloat(input.fittingChargeRoman);
  if (!length || !height || !fabricPrice) return null;

  let totalFabric = (height + 10) / 39;
  if (length > 54) totalFabric *= 2;

  const sqft = (height * length) / 144;
  const labourCost = sqft * input.labourRateRoman;
  const fabricCost = totalFabric * fabricPrice;
  const fit = isNaN(fitting) ? 0 : fitting;
  const total = labourCost + fabricCost + fit;

  return { partyName: party, totalFabric, sqft, labourCost, fabricCost, fitting: fit, total };
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-dashed border-border py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums text-right">{value}</span>
    </div>
  );
}

export default function CurtainCalculatorPage() {
  const { toast } = useToast();

  // --- 3 Fold state ---
  const [partyName, setPartyName] = useState("");
  const [lengthIn, setLengthIn] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [fabricRate, setFabricRate] = useState("");
  const [channelRate, setChannelRate] = useState("180");
  const [fittingCost, setFittingCost] = useState("200");
  const [labourCostPerPart, setLabourCostPerPart] = useState(200);
  const [labourInput3, setLabourInput3] = useState("200");
  const [quotation3, setQuotation3] = useState<Quotation3Fold | null>(null);

  // --- Roman state ---
  const [partyNameRoman, setPartyNameRoman] = useState("");
  const [lengthRoman, setLengthRoman] = useState("");
  const [heightRoman, setHeightRoman] = useState("");
  const [fabricPriceRoman, setFabricPriceRoman] = useState("");
  const [fittingChargeRoman, setFittingChargeRoman] = useState("200");
  const [labourRateRoman, setLabourRateRoman] = useState(150);
  const [labourInputRoman, setLabourInputRoman] = useState("150");
  const [resultRoman, setResultRoman] = useState<ResultRoman | null>(null);

  const calculate3Fold = useCallback(() => {
    const q = computeQuotation3Fold({
      partyName,
      lengthIn,
      heightIn,
      fabricRate,
      channelRate,
      fittingCost,
      labourCostPerPart,
    });
    if (!q) {
      toast({ title: "Check fields", description: "Enter window length, height, and fabric rate.", variant: "destructive" });
      return;
    }
    setQuotation3(q);
  }, [partyName, lengthIn, heightIn, fabricRate, channelRate, fittingCost, labourCostPerPart, toast]);

  const applyLabour3 = () => {
    const v = parseFloat(labourInput3);
    if (isNaN(v)) return;
    setLabourCostPerPart(v);
    const q = computeQuotation3Fold({
      partyName,
      lengthIn,
      heightIn,
      fabricRate,
      channelRate,
      fittingCost,
      labourCostPerPart: v,
    });
    if (q) {
      setQuotation3(q);
      toast({ title: "Labour updated", description: "Totals refreshed." });
    } else {
      toast({ title: "Labour updated" });
    }
  };

  const downloadPdf3Fold = async () => {
    if (!quotation3) {
      toast({ title: "Calculate first", variant: "destructive" });
      return;
    }
    const q = quotation3;
    const docDefinition: TDocumentDefinitions = {
      content: [
        { text: "MGR CASA", style: "logoHeader" },
        { text: "WHERE LUXURY MEETS COMFORT", style: "subHeader" },
        { canvas: [{ type: "line", x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 1, lineColor: "#ccc" }] },
        { text: "\n" },
        { text: "3 Fold Curtain Quotation", style: "header" },
        { text: `Party Name: ${q.partyName}`, margin: [0, 10, 0, 10] },
        {
          table: {
            widths: ["*", "auto"],
            body: [
              [
                { text: "Description", bold: true, fillColor: "#eee" },
                { text: "Amount (₹)", bold: true, fillColor: "#eee" },
              ],
              [`Fabric (${q.fabricMeters.toFixed(2)}m)`, q.fabricCost.toFixed(2)],
              [`Labour (${q.parts} parts)`, q.labourCost.toFixed(2)],
              [`Channel (${q.channelFeetRounded} ft)`, q.channelCost.toFixed(2)],
              ["Fitting", q.fittingCost.toFixed(2)],
              [
                { text: "TOTAL", bold: true, color: "red" },
                { text: String(Math.round(q.totalCost)), bold: true, color: "red" },
              ],
            ],
          },
          layout: "lightHorizontalLines",
        },
      ],
      styles: pdfStyles,
    };
    await downloadPdfDocument(docDefinition, "MGR_CASA_3Fold.pdf");
  };

  const calculateRoman = useCallback(() => {
    const r = computeRoman({
      partyName: partyNameRoman,
      lengthRoman,
      heightRoman,
      fabricPriceRoman,
      fittingChargeRoman,
      labourRateRoman,
    });
    if (!r) {
      toast({ title: "Check fields", description: "Enter length, height, and fabric price.", variant: "destructive" });
      return;
    }
    setResultRoman(r);
  }, [partyNameRoman, lengthRoman, heightRoman, fabricPriceRoman, fittingChargeRoman, labourRateRoman, toast]);

  const applyLabourRoman = () => {
    const v = parseFloat(labourInputRoman);
    if (isNaN(v)) return;
    setLabourRateRoman(v);
    const r = computeRoman({
      partyName: partyNameRoman,
      lengthRoman,
      heightRoman,
      fabricPriceRoman,
      fittingChargeRoman,
      labourRateRoman: v,
    });
    if (r) {
      setResultRoman(r);
      toast({ title: "Labour rate updated", description: "Totals refreshed." });
    } else {
      toast({ title: "Labour rate updated" });
    }
  };

  const downloadPdfRoman = async () => {
    if (!resultRoman) {
      toast({ title: "Calculate first", variant: "destructive" });
      return;
    }
    const r = resultRoman;
    const docDefinition: TDocumentDefinitions = {
      content: [
        { text: "MGR CASA", style: "logoHeader" },
        { text: "WHERE LUXURY MEETS COMFORT", style: "subHeader" },
        { canvas: [{ type: "line", x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 1, lineColor: "#ccc" }] },
        { text: "\n" },
        { text: "Roman Curtain Quotation", style: "header" },
        { text: `Party Name: ${r.partyName}`, margin: [0, 10, 0, 10] },
        {
          table: {
            widths: ["*", "auto"],
            body: [
              [
                { text: "Description", bold: true, fillColor: "#eee" },
                { text: "Amount (₹)", bold: true, fillColor: "#eee" },
              ],
              [`Fabric (${r.totalFabric.toFixed(2)}m)`, r.fabricCost.toFixed(2)],
              [`Labour (${r.sqft.toFixed(2)} sq.ft)`, r.labourCost.toFixed(2)],
              ["Fitting", r.fitting.toFixed(2)],
              [
                { text: "TOTAL", bold: true, color: "red" },
                { text: r.total.toFixed(2), bold: true, color: "red" },
              ],
            ],
          },
          layout: "lightHorizontalLines",
        },
      ],
      styles: pdfStyles,
    };
    await downloadPdfDocument(docDefinition, "MGR_CASA_Roman.pdf");
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 max-w-xl  w-full">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Curtain costing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          3 fold and Roman curtain estimates — same formulas as the standalone tool, with PDF quotations.
        </p>
      </div>

      <Tabs defaultValue="3fold" className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-11">
          <TabsTrigger value="3fold">3 fold curtain</TabsTrigger>
          <TabsTrigger value="roman">Roman curtain</TabsTrigger>
        </TabsList>

        <TabsContent value="3fold" className="mt-6">
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">3 fold curtain</CardTitle>
              <CardDescription>Parts from length (20″ per part), fabric, channel, labour, and fitting.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="party-3">Party name</Label>
                <Input id="party-3" placeholder="Customer name" value={partyName} onChange={(e) => setPartyName(e.target.value)} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="len-3">Window length (inch)</Label>
                  <Input id="len-3" type="number" inputMode="decimal" placeholder="0" value={lengthIn} onChange={(e) => setLengthIn(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="h-3">Window height (inch)</Label>
                  <Input id="h-3" type="number" inputMode="decimal" placeholder="0" value={heightIn} onChange={(e) => setHeightIn(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fabric-3">Fabric rate (per meter)</Label>
                <Input id="fabric-3" type="number" inputMode="decimal" placeholder="₹" value={fabricRate} onChange={(e) => setFabricRate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="channel-3">Channel rate (per feet)</Label>
                <Input id="channel-3" type="number" inputMode="decimal" value={channelRate} onChange={(e) => setChannelRate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fit-3">Fitting cost (₹)</Label>
                <Input id="fit-3" type="number" inputMode="decimal" value={fittingCost} onChange={(e) => setFittingCost(e.target.value)} />
              </div>

              <Collapsible>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors",
                      "w-fit",
                    )}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit labour cost (default: ₹200 / part)
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1.5 flex-1 min-w-[120px]">
                      <Label htmlFor="lab-3" className="text-xs">
                        Labour per part (₹)
                      </Label>
                      <Input id="lab-3" type="number" value={labourInput3} onChange={(e) => setLabourInput3(e.target.value)} />
                    </div>
                    <Button type="button" variant="secondary" size="sm" onClick={applyLabour3}>
                      Set
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button type="button" className="flex-1" onClick={calculate3Fold}>
                  Calculate
                </Button>
                <Button type="button" variant="outline" className="flex-1 gap-2" onClick={() => void downloadPdf3Fold()}>
                  <Download className="h-4 w-4" />
                  Download PDF
                </Button>
              </div>

              {quotation3 ? (
                <div className="mt-4 rounded-xl border border-border bg-card p-4 text-sm">
                  <ResultRow label="Party" value={quotation3.partyName} />
                  <ResultRow label="Parts required" value={String(quotation3.parts)} />
                  <ResultRow label={`Fabric (${quotation3.fabricMeters.toFixed(2)} m)`} value={formatInrDetail(quotation3.fabricCost)} />
                  <ResultRow label="Labour" value={formatInrDetail(quotation3.labourCost)} />
                  <ResultRow label={`Channel (${quotation3.channelFeetRounded} ft)`} value={formatInrDetail(quotation3.channelCost)} />
                  <ResultRow label="Fitting" value={formatInrDetail(quotation3.fittingCost)} />
                  <p className="pt-4 mt-2 border-t border-border text-right text-xl font-bold text-destructive tabular-nums">
                    Total: {formatInr(Math.round(quotation3.totalCost))}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roman" className="mt-6">
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Roman curtain</CardTitle>
              <CardDescription>Fabric doubles when length exceeds 54″. Labour is per sq.ft.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="party-r">Party name</Label>
                <Input id="party-r" placeholder="Customer name" value={partyNameRoman} onChange={(e) => setPartyNameRoman(e.target.value)} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="len-r">Length (inch)</Label>
                  <Input id="len-r" type="number" inputMode="decimal" placeholder="0" value={lengthRoman} onChange={(e) => setLengthRoman(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="h-r">Height (inch)</Label>
                  <Input id="h-r" type="number" inputMode="decimal" placeholder="0" value={heightRoman} onChange={(e) => setHeightRoman(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fabric-r">Fabric price (per meter)</Label>
                <Input
                  id="fabric-r"
                  type="number"
                  inputMode="decimal"
                  placeholder="₹"
                  value={fabricPriceRoman}
                  onChange={(e) => setFabricPriceRoman(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fit-r">Fitting charge (₹)</Label>
                <Input id="fit-r" type="number" inputMode="decimal" value={fittingChargeRoman} onChange={(e) => setFittingChargeRoman(e.target.value)} />
              </div>

              <Collapsible>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit labour rate (default: ₹150 / sq.ft)
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1.5 flex-1 min-w-[120px]">
                      <Label htmlFor="lab-r" className="text-xs">
                        Labour per sq.ft (₹)
                      </Label>
                      <Input id="lab-r" type="number" value={labourInputRoman} onChange={(e) => setLabourInputRoman(e.target.value)} />
                    </div>
                    <Button type="button" variant="secondary" size="sm" onClick={applyLabourRoman}>
                      Set
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button type="button" className="flex-1" onClick={calculateRoman}>
                  Calculate
                </Button>
                <Button type="button" variant="outline" className="flex-1 gap-2" onClick={() => void downloadPdfRoman()}>
                  <Download className="h-4 w-4" />
                  Download PDF
                </Button>
              </div>

              {resultRoman ? (
                <div className="mt-4 rounded-xl border border-border bg-card p-4 text-sm">
                  <ResultRow label="Party" value={resultRoman.partyName} />
                  <ResultRow label="Area" value={`${resultRoman.sqft.toFixed(2)} sq.ft`} />
                  <ResultRow label={`Fabric (${resultRoman.totalFabric.toFixed(2)} m)`} value={formatInrDetail(resultRoman.fabricCost)} />
                  <ResultRow label="Labour" value={formatInrDetail(resultRoman.labourCost)} />
                  <ResultRow label="Fitting" value={formatInrDetail(resultRoman.fitting)} />
                  <p className="pt-4 mt-2 border-t border-border text-right text-xl font-bold text-destructive tabular-nums">
                    Total: {formatInrDetail(resultRoman.total)}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
