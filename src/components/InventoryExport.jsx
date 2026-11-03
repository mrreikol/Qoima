import { serializeInventoryCsv } from "../data/inventoryCsv";
import { downloadInventoryFile } from "../data/downloadCsv";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Download, LoaderCircle } from "lucide-react";
import { Button } from "./ui";
import { supabase } from "../lib/supabase";
import { createInventoryExportService } from "../services/inventoryExportService";

const service = createInventoryExportService(supabase);
export default function InventoryExport({ inventory, filters, matchingCount }) {
  const [state, setState] = useState({ busy: false, error: "", message: "" });
  const pending = useRef(null);
  const menu = useRef(null);
  const trigger = useRef(null);
  const menuId = useId();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event) => {
      if (!menu.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);
  useEffect(() => () => pending.current?.abort(), []);
  async function exportFile(format) {
    if (pending.current) return;
    setOpen(false);
    trigger.current?.focus();
    const controller = new AbortController();
    pending.current = controller;
    // Freeze the filter selection at click time while the fresh read is pending.
    const selection = { ...filters };
    setState({
      busy: true,
      error: "",
      message: "Fetching all matching products...",
    });
    try {
      const result = await service.load(
        inventory.userId,
        selection,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (!result.count) {
        setState({
          busy: false,
          error: "",
          message:
            "No matching products to export. Change or clear your filters.",
        });
        return;
      }
      let content;
      if (format === "xlsx") {
        setState({
          busy: true,
          error: "",
          message: "Preparing Excel workbook...",
        });
        const { buildInventoryXlsx } = await import("../data/inventoryXlsx.js");
        if (controller.signal.aborted) return;
        content = await buildInventoryXlsx(result.rows);
      } else {
        content = serializeInventoryCsv(result.rows).csv;
      }
      if (controller.signal.aborted) return;
      downloadInventoryFile(content, format);
      setState({
        busy: false,
        error: "",
        message: `${format === "xlsx" ? "Excel workbook" : "CSV"} prepared: ${result.count.toLocaleString()} ${result.count === 1 ? "product" : "products"} matching the filters selected when export started. Download requested.`,
      });
    } catch {
      if (!controller.signal.aborted)
        setState({
          busy: false,
          error:
            "Unable to export inventory. Check your connection and browser download permissions, then try again.",
          message: "",
        });
    } finally {
      if (pending.current === controller) pending.current = null;
    }
  }
  return (
    <div className="inventory-export">
      <div
        className="inventory-export-menu"
        ref={menu}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            trigger.current?.focus();
          }
        }}
      >
        <Button
          type="button"
          variant="secondary"
          ref={trigger}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={menuId}
          aria-describedby={`${menuId}-scope`}
          disabled={state.busy || inventory.loading || !!inventory.error}
        >
          {state.busy ? (
            <LoaderCircle size={16} className="spinner" />
          ) : (
            <Download size={16} />
          )}
          {state.busy ? "Exporting..." : "Export"}
          <ChevronDown size={14} />
        </Button>
        {open && (
          <div
            id={menuId}
            className="inventory-export-options"
            role="group"
            aria-label="Export format"
          >
            <button type="button" onClick={() => exportFile("xlsx")}>
              Excel (.xlsx)
            </button>
            <button type="button" onClick={() => exportFile("csv")}>
              CSV (.csv)
            </button>
          </div>
        )}
      </div>
      <span id={`${menuId}-scope`} className="visually-hidden">
        Export all{" "}
        {inventory.loading || inventory.error
          ? "matching"
          : matchingCount.toLocaleString()}{" "}
        products matching the current filters and sort.
      </span>
      {state.message && <p role="status">{state.message}</p>}
      {state.error && (
        <p role="alert" className="red-text">
          {state.error}
        </p>
      )}
    </div>
  );
}
