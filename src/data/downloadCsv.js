// The caller reports a download request; browser saving cannot be guaranteed.
export function downloadInventoryFile(content, format, browser = globalThis) {
  if (!["csv", "xlsx"].includes(format))
    throw new Error("Choose a supported export format.");
  const type =
    format === "csv"
      ? "text/csv;charset=utf-8"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const url = browser.URL.createObjectURL(
    new browser.Blob([content], { type }),
  );
  try {
    const link = browser.document.createElement("a");
    link.href = url;
    const today = new Date();
    const dateStamp = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0"),
    ].join("-");
    link.download = `qoima-products-${dateStamp}.${format}`;
    browser.document.body.appendChild(link);
    try {
      link.click();
    } finally {
      link.remove();
    }
  } finally {
    browser.setTimeout(() => browser.URL.revokeObjectURL(url), 30000);
  }
}

export function downloadInventoryCsv(csv, browser = globalThis) {
  return downloadInventoryFile(csv, "csv", browser);
}
