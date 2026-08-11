// Renders "one row per line, comma-separated" table source into a <table>.
// The first non-empty line is treated as the header row.
export function renderTable(source, container) {
  container.innerHTML = "";
  const lines = String(source || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return;

  const [headerLine, ...bodyLines] = lines;
  const table = document.createElement("table");
  table.className = "formalized-table";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  for (const cell of headerLine.split(",")) {
    const th = document.createElement("th");
    th.textContent = cell.trim();
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const line of bodyLines) {
    const tr = document.createElement("tr");
    for (const cell of line.split(",")) {
      const td = document.createElement("td");
      td.textContent = cell.trim();
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  container.appendChild(table);
}
