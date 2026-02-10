/**
 * Converts Tiptap task list HTML into Apple Notes-compatible HTML.
 * Apple Notes doesn't support `<input type="checkbox">` or `data-checked`,
 * so we replace task items with Unicode checkbox symbols.
 */

function extractTaskItemChecked(li: Element): boolean {
  const dataChecked = li.getAttribute("data-checked");
  if (dataChecked === "true") return true;
  if (dataChecked === "false") return false;

  const checkbox = li.querySelector("input[type='checkbox']") as HTMLInputElement | null;
  if (checkbox) return checkbox.checked || checkbox.hasAttribute("checked");

  return false;
}

function normalizeTaskItemContent(contentHtml: string): string {
  const trimmed = contentHtml.trim();
  if (!trimmed) return "";

  const singleParagraphMatch = trimmed.match(/^<p>([\s\S]*)<\/p>$/i);
  if (singleParagraphMatch) return singleParagraphMatch[1].trim();

  return trimmed;
}

function replaceTaskListWithSymbolLines(taskList: Element): void {
  const rows: HTMLElement[] = [];

  const taskItems = Array.from(
    taskList.querySelectorAll(":scope > li[data-type='taskItem'], :scope > li")
  );

  for (const taskItem of taskItems) {
    const checked = extractTaskItemChecked(taskItem);
    const symbol = checked ? "\u2611" : "\u2610";

    const contentContainer =
      taskItem.querySelector(":scope > div") ??
      taskItem.querySelector(":scope > p") ??
      taskItem;

    const row = document.createElement("div");
    const contentHtml = normalizeTaskItemContent(contentContainer.innerHTML);
    if (contentHtml) {
      row.innerHTML = `${symbol} ${contentHtml}`;
    } else {
      row.textContent = symbol;
    }
    rows.push(row);
  }

  if (rows.length === 0) {
    taskList.remove();
    return;
  }

  taskList.replaceWith(...rows);
}

export function normalizeHtmlForAppleNotes(html: string): string {
  if (!html.trim()) return "";
  if (typeof DOMParser === "undefined") return html;

  const doc = new DOMParser().parseFromString(html, "text/html");
  const taskLists = Array.from(doc.body.querySelectorAll("ul[data-type='taskList']"));
  taskLists.forEach((taskList) => replaceTaskListWithSymbolLines(taskList));

  return doc.body.innerHTML.trim();
}
