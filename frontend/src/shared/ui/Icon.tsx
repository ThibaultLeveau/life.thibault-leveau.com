const paths = {
  sparkles:
    "M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5zM20 2v4M18 4h4",
  message: "M4 4h16v12H9l-5 4V4zM8 8h8M8 12h5",
  stop: "M6 6h12v12H6z",
  memory:
    "M9 18V7a3 3 0 1 0-6 0 4 4 0 0 0 0 7 3 3 0 0 0 6 4M15 18V7a3 3 0 1 1 6 0 4 4 0 0 1 0 7 3 3 0 0 1-6 4M9 9h6M9 15h6",
  ruler: "m3 16 13-13 5 5L8 21zM13 6l2 2M10 9l2 2M7 12l2 2M4 15l2 2",
  dumbbell: "m6 4 14 14M4 6l2-2 4 4-2 2zM14 16l2-2 4 4-2 2zM2 8l6-6M16 22l6-6",
  timer:
    "M9 2h6M12 6v2M18 5l2 2M12 11v4l3 2M20 14a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  route:
    "M6 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0M22 20a2 2 0 1 1-4 0 2 2 0 0 1 4 0M6 4h10a4 4 0 0 1 0 8H8a4 4 0 0 0 0 8h10",
  activity: "M2 12h5l3-8 4 16 3-8h5",
  book: "M4 3h6a3 3 0 0 1 3 3v16a4 4 0 0 0-4-2H3V4a1 1 0 0 1 1-1M13 6a3 3 0 0 1 3-3h5v17h-4a4 4 0 0 0-4 2M6 7h3M6 11h3M16 7h2M16 11h2",
  cart: "M2 3h3l3 13h11l3-9H6M9 20h.01M18 20h.01",
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
