const paths = {
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  edit: "m16 3 5 5-12 12-6 1 1-6L16 3M13 6l5 5",
  copy: "M8 8h13v13H8zM16 8V3H3v13h5",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  select: "M4 4h16v16H4zM8 12l3 3 5-6",
  plus: "M12 5v14M5 12h14",
  search: "m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  list: "M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01",
  board: "M3 4h5v16H3zM10 4h5v10h-5zM17 4h4v13h-4z",
  chevron: "m9 5 7 7-7 7",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  sun: "M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  moon: "M21 13a9 9 0 0 1-10-10A9 9 0 1 0 21 13",
  settings: "M4 7h16M4 17h16M8 4v6M16 14v6",
  logout: "M9 3H4v18h5M13 7l5 5-5 5M8 12h13",
  check: "m5 12 4 4L19 6",
  x: "m6 6 12 12M18 6 6 18",
  calendar: "M4 5h16v16H4zM4 10h16M8 3v4M16 3v4",
  repeat:
    "m17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3",
  flag: "M5 21V3l7 2 7-2v10l-7 2-7-2",
  grip: "M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  archive: "M3 3h18v5H3zM5 8v13h14V8M9 12h6",
  restore: "M3 11a9 9 0 1 1 2 7M3 3v8h8",
  folder: "M3 6V4h6l3 3h9v13H3z",
  label: "M3 3h8l10 10-8 8L3 11zM7 7h.01",
  menu: "M4 6h16M4 12h16M4 18h16",
  up: "m6 14 6-6 6 6",
  down: "m6 10 6 6 6-6",
  info: "M12 11v6M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
} as const;
export type IconName = keyof typeof paths;
export function Icon({
  name,
  size = 18,
}: {
  name: keyof typeof paths;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
