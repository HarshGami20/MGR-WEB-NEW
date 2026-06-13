import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GuideTarget } from "@/components/user-guide/guide-target";
import { LivePageRoot } from "@/components/user-guide/guide-live/shared";
import { DUMMY } from "@/lib/user-guide/mock-data";
import { Edit, Plus, Search, Trash2 } from "lucide-react";

type ProcurementPartnersPreviewProps = {
  screenId: string;
  activeHighlight: string | null;
};

type PartnerKind = "supplier" | "manufacturer";

const CONFIG: Record<
  PartnerKind,
  {
    title: string;
    subtitle: string;
    addLabel: string;
    searchPlaceholder: string;
    entityLabel: string;
    extraColumn: { header: string; key: "gstNumber" | "specialization" };
    dialogExtra: "gst" | "specialization";
    formOrder: "supplier" | "manufacturer";
  }
> = {
  supplier: {
    title: "Suppliers",
    subtitle: "Manage your product suppliers",
    addLabel: "Add Supplier",
    searchPlaceholder: "Search suppliers...",
    entityLabel: "Supplier",
    extraColumn: { header: "GST Number", key: "gstNumber" },
    dialogExtra: "gst",
    formOrder: "supplier",
  },
  manufacturer: {
    title: "Manufacturers",
    subtitle: "Manage your custom furniture manufacturers",
    addLabel: "Add Manufacturer",
    searchPlaceholder: "Search manufacturers...",
    entityLabel: "Manufacturer",
    extraColumn: { header: "Specialization", key: "specialization" },
    dialogExtra: "specialization",
    formOrder: "manufacturer",
  },
};

function getKind(screenId: string): PartnerKind {
  return screenId.startsWith("manufacturers-") ? "manufacturer" : "supplier";
}

function getRows(kind: PartnerKind) {
  return kind === "supplier" ? DUMMY.suppliersList : DUMMY.manufacturersList;
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
      Active
    </Badge>
  ) : (
    <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
      Inactive
    </Badge>
  );
}

function PartnerPageHeader({
  kind,
  activeHighlight,
}: {
  kind: PartnerKind;
  activeHighlight: string | null;
}) {
  const cfg = CONFIG[kind];
  return (
    <GuideTarget id="page-header" activeHighlight={activeHighlight} label={`${cfg.title} page`}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{cfg.title}</h2>
          <p className="text-muted-foreground">{cfg.subtitle}</p>
        </div>
        <GuideTarget id="header-action-add" activeHighlight={activeHighlight} label={cfg.addLabel} dimOthers={false}>
          <Button disabled>
            <Plus className="mr-2 h-4 w-4" />
            {cfg.addLabel}
          </Button>
        </GuideTarget>
      </div>
    </GuideTarget>
  );
}

function PartnerSearchBar({ kind, activeHighlight }: { kind: PartnerKind; activeHighlight: string | null }) {
  const cfg = CONFIG[kind];
  return (
    <GuideTarget id="search" activeHighlight={activeHighlight} label="Search">
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card p-4 rounded-lg border">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input readOnly placeholder={cfg.searchPlaceholder} className="pl-8 bg-background" />
        </div>
      </div>
    </GuideTarget>
  );
}

function PartnerTable({
  kind,
  activeHighlight,
  highlightRowId,
}: {
  kind: PartnerKind;
  activeHighlight: string | null;
  highlightRowId?: number;
}) {
  const cfg = CONFIG[kind];
  const rows = getRows(kind);

  return (
    <GuideTarget id="data-table" activeHighlight={activeHighlight} label={`${cfg.title} table`}>
      <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Contact Person</TableHead>
              <TableHead>Mobile</TableHead>
              <TableHead>{cfg.extraColumn.header}</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const extra =
                cfg.extraColumn.key === "gstNumber"
                  ? (row as (typeof DUMMY.suppliersList)[number]).gstNumber
                  : (row as (typeof DUMMY.manufacturersList)[number]).specialization;
              return (
                <TableRow key={row.id} className={highlightRowId === row.id ? "bg-primary/5" : undefined}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>{row.contactPerson || "—"}</TableCell>
                  <TableCell>{row.mobile || "—"}</TableCell>
                  <TableCell>
                    {cfg.extraColumn.key === "gstNumber" ? (
                      <span className="font-mono text-xs">{extra || "—"}</span>
                    ) : (
                      extra || "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge active={row.isActive} />
                  </TableCell>
                  <TableCell className="text-right">
                    <GuideTarget
                      id="table-actions"
                      activeHighlight={activeHighlight}
                      label="Row actions"
                      dimOthers={false}
                    >
                      <div className="inline-flex items-center justify-end gap-2">
                        <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
                          <Edit className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <GuideTarget
                          id="delete-action"
                          activeHighlight={activeHighlight}
                          label="Delete"
                          dimOthers={false}
                          className="inline-flex"
                        >
                          <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </GuideTarget>
                      </div>
                    </GuideTarget>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="border-t px-4 py-3 text-sm text-muted-foreground">
          Showing 1–{rows.length} of {rows.length} {kind === "supplier" ? "suppliers" : "manufacturers"}
        </div>
      </div>
    </GuideTarget>
  );
}

function PartnerDialog({
  kind,
  mode,
  activeHighlight,
}: {
  kind: PartnerKind;
  mode: "add" | "edit";
  activeHighlight: string | null;
}) {
  const cfg = CONFIG[kind];
  const isEdit = mode === "edit";
  const sample = getRows(kind)[0];

  return (
    <GuideTarget id="partner-dialog" activeHighlight={activeHighlight} label={`${cfg.entityLabel} dialog`}>
      <div className="rounded-lg border bg-card shadow-lg p-6 max-w-[500px] mx-auto mt-6 space-y-4">
        <p className="font-semibold">
          {isEdit ? `Edit ${cfg.entityLabel}` : `Add ${cfg.entityLabel}`}
        </p>

        <GuideTarget id="company-name" activeHighlight={activeHighlight} label="Company name" dimOthers={false}>
          <div className="space-y-2">
            <Label>Company Name*</Label>
            <Input
              readOnly
              placeholder={kind === "supplier" ? "e.g. ABC Furniture Pvt Ltd" : "e.g. Premium Wood Works"}
              defaultValue={isEdit ? sample.name : ""}
              className="bg-background"
            />
          </div>
        </GuideTarget>

        <div className="grid grid-cols-2 gap-4">
          <GuideTarget id="contact-person" activeHighlight={activeHighlight} label="Contact person" dimOthers={false}>
            <div className="space-y-2">
              <Label>Contact Person</Label>
              <Input readOnly placeholder="e.g. Rahul Sharma" defaultValue={isEdit ? sample.contactPerson : ""} className="bg-background" />
            </div>
          </GuideTarget>
          <GuideTarget id="contact-mobile" activeHighlight={activeHighlight} label="Mobile number" dimOthers={false}>
            <div className="space-y-2">
              <Label>Mobile Number</Label>
              <Input readOnly placeholder="10-digit mobile" defaultValue={isEdit ? sample.mobile : ""} className="bg-background" />
            </div>
          </GuideTarget>
        </div>

        {cfg.formOrder === "supplier" ? (
          <>
            <GuideTarget id="portal-password" activeHighlight={activeHighlight} label="Portal password" dimOthers={false}>
              <div className="space-y-2">
                <Label>{isEdit ? "Supplier Portal Password (optional reset)" : "Supplier Portal Password*"}</Label>
                <Input readOnly type="password" placeholder={isEdit ? "Leave blank to keep current password" : "Set supplier portal password"} className="bg-background" />
                <p className="text-xs text-muted-foreground">
                  {isEdit
                    ? "If provided, this will reset the linked supplier portal user password."
                    : "This creates the direct supplier portal login from Procurement."}
                </p>
              </div>
            </GuideTarget>
            <div className="grid grid-cols-2 gap-4">
              <GuideTarget id="contact-email" activeHighlight={activeHighlight} label="Email" dimOthers={false}>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input readOnly type="email" placeholder="name@company.com" className="bg-background" />
                </div>
              </GuideTarget>
              <GuideTarget id="gst-number" activeHighlight={activeHighlight} label="GST number" dimOthers={false}>
                <div className="space-y-2">
                  <Label>GST Number</Label>
                  <Input readOnly placeholder="15-character GSTIN" defaultValue={isEdit ? sample.gstNumber ?? "" : ""} className="bg-background font-mono text-sm" />
                </div>
              </GuideTarget>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <GuideTarget id="contact-email" activeHighlight={activeHighlight} label="Email" dimOthers={false}>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input readOnly type="email" placeholder="name@company.com" className="bg-background" />
                </div>
              </GuideTarget>
              <GuideTarget id="specialization" activeHighlight={activeHighlight} label="Specialization" dimOthers={false}>
                <div className="space-y-2">
                  <Label>Specialization</Label>
                  <Input
                    readOnly
                    placeholder="e.g. Wood, Metal, Upholstery"
                    defaultValue={isEdit ? (sample as (typeof DUMMY.manufacturersList)[number]).specialization : ""}
                    className="bg-background"
                  />
                </div>
              </GuideTarget>
            </div>
            <GuideTarget id="address-field" activeHighlight={activeHighlight} label="Address" dimOthers={false}>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input readOnly placeholder="Street, city, state, pincode" className="bg-background" />
              </div>
            </GuideTarget>
            <GuideTarget id="portal-password" activeHighlight={activeHighlight} label="Portal password" dimOthers={false}>
              <div className="space-y-2">
                <Label>{isEdit ? "Manufacturer Portal Password (optional reset)" : "Manufacturer Portal Password*"}</Label>
                <Input readOnly type="password" placeholder={isEdit ? "Leave blank to keep current password" : "Set manufacturer portal password"} className="bg-background" />
                <p className="text-xs text-muted-foreground">
                  {isEdit
                    ? "If provided, this will reset the linked manufacturer portal user password."
                    : "This creates the direct manufacturer portal login from Procurement."}
                </p>
              </div>
            </GuideTarget>
          </>
        )}

        {cfg.formOrder === "supplier" ? (
          <GuideTarget id="address-field" activeHighlight={activeHighlight} label="Address" dimOthers={false}>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input readOnly placeholder="Street, city, state, pincode" className="bg-background" />
            </div>
          </GuideTarget>
        ) : null}

        <div className="flex justify-end gap-2 pt-4">
          <GuideTarget id="form-cancel" activeHighlight={activeHighlight} label="Cancel" dimOthers={false}>
            <Button type="button" variant="outline" disabled>
              Cancel
            </Button>
          </GuideTarget>
          <GuideTarget id="form-save" activeHighlight={activeHighlight} label="Save" dimOthers={false}>
            <Button type="button" disabled>
              {isEdit ? `Update ${cfg.entityLabel}` : `Create ${cfg.entityLabel}`}
            </Button>
          </GuideTarget>
        </div>
      </div>
    </GuideTarget>
  );
}

function DeleteConfirm({ kind, activeHighlight }: { kind: PartnerKind; activeHighlight: string | null }) {
  const sample = getRows(kind)[0];
  return (
    <GuideTarget id="delete-dialog" activeHighlight={activeHighlight} label="Delete confirmation">
      <div className="rounded-lg border bg-card shadow-lg p-6 max-w-md mx-auto mt-6 space-y-3">
        <p className="font-semibold">Delete {CONFIG[kind].entityLabel.toLowerCase()}?</p>
        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete <span className="font-medium text-foreground">{sample.name}</span>?
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled>
            Delete
          </Button>
        </div>
      </div>
    </GuideTarget>
  );
}

function PartnerListBase({
  kind,
  activeHighlight,
  highlightRowId,
}: {
  kind: PartnerKind;
  activeHighlight: string | null;
  highlightRowId?: number;
}) {
  return (
    <>
      <PartnerPageHeader kind={kind} activeHighlight={activeHighlight} />
      <PartnerSearchBar kind={kind} activeHighlight={activeHighlight} />
      <PartnerTable kind={kind} activeHighlight={activeHighlight} highlightRowId={highlightRowId} />
    </>
  );
}

export function GuideLiveProcurementPartnersPreview({
  screenId,
  activeHighlight,
}: ProcurementPartnersPreviewProps) {
  const kind = getKind(screenId);
  const base = kind === "supplier" ? "suppliers" : "manufacturers";

  if (screenId === `${base}-list` || screenId === `${base}-create`) {
    if (screenId.endsWith("-create")) {
      return (
        <LivePageRoot>
          <PartnerListBase kind={kind} activeHighlight={activeHighlight} />
          <PartnerDialog kind={kind} mode="add" activeHighlight={activeHighlight} />
        </LivePageRoot>
      );
    }
    return (
      <LivePageRoot>
        <PartnerListBase kind={kind} activeHighlight={activeHighlight} />
      </LivePageRoot>
    );
  }

  if (screenId === `${base}-edit`) {
    return (
      <LivePageRoot>
        <PartnerListBase kind={kind} activeHighlight={activeHighlight} highlightRowId={1} />
        <PartnerDialog kind={kind} mode="edit" activeHighlight={activeHighlight} />
      </LivePageRoot>
    );
  }

  if (screenId === `${base}-delete`) {
    return (
      <LivePageRoot>
        <PartnerListBase kind={kind} activeHighlight={activeHighlight} highlightRowId={1} />
        <DeleteConfirm kind={kind} activeHighlight={activeHighlight} />
      </LivePageRoot>
    );
  }

  return (
    <LivePageRoot>
      <PartnerListBase kind={kind} activeHighlight={activeHighlight} />
    </LivePageRoot>
  );
}
