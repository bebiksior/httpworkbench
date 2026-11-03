export type PageItem = number | "gap";

export const parsePage = (raw: unknown): number => {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return 1;
  return Math.max(1, Number(raw));
};

export const clampPage = (page: number, pageCount: number) =>
  Math.min(Math.max(page, 1), Math.max(pageCount, 1));

export const pageItems = (page: number, pageCount: number): PageItem[] => {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }

  const shown = new Set([1, pageCount, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((p) => shown.add(p));
  if (page >= pageCount - 2) {
    [pageCount - 3, pageCount - 2, pageCount - 1].forEach((p) => shown.add(p));
  }

  const pages = [...shown]
    .filter((p) => p >= 1 && p <= pageCount)
    .sort((a, b) => a - b);

  const items: PageItem[] = [];
  let previous = 0;
  for (const p of pages) {
    // A gap hiding a single page would be as wide as the page itself.
    if (p - previous === 2) items.push(p - 1);
    else if (p - previous > 2) items.push("gap");
    items.push(p);
    previous = p;
  }
  return items;
};
