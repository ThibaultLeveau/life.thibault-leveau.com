import { Icon } from "../../../shared/ui/Icon";
import { tr, type MessageKey } from "../i18n";

const palette: readonly (readonly [string, MessageKey])[] = [
  ["#c05a45", "color_terracotta"],
  ["#d95b5b", "color_red"],
  ["#d97706", "color_orange"],
  ["#d4a72c", "color_yellow"],
  ["#748b79", "color_sage"],
  ["#4f8f62", "color_green"],
  ["#2a9d8f", "color_teal"],
  ["#3b82b6", "color_blue"],
  ["#6466a8", "color_indigo"],
  ["#8b5ca6", "color_purple"],
  ["#bf6b8a", "color_pink"],
  ["#b38b6d", "color_brown"],
  ["#e5c7ad", "color_sand"],
  ["#c8d5df", "color_mist"],
  ["#6b7280", "color_gray"],
  ["#333333", "color_charcoal"],
];

export function ColorPicker({
  label = tr("color"),
  value,
  onChange,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = value.toLowerCase();
  return (
    <fieldset className="task-color-picker">
      <legend>{label}</legend>
      <div className="task-color-grid">
        {palette.map(([color, name]) => (
          <button
            key={color}
            type="button"
            className="task-color-swatch"
            style={{ backgroundColor: color }}
            aria-label={`${tr(name)} (${color.toUpperCase()})`}
            title={`${tr(name)} (${color.toUpperCase()})`}
            aria-pressed={selected === color}
            onClick={() => onChange(color)}
          >
            {selected === color && (
              <span className="task-color-check">
                <Icon name="check" size={16} />
              </span>
            )}
          </button>
        ))}
      </div>
      <label className="task-color-custom">
        <input
          type="color"
          name="color"
          value={selected}
          onChange={(event) => onChange(event.target.value)}
        />
        <span>{tr("custom_color")}</span>
        <span className="task-color-value">{selected.toUpperCase()}</span>
      </label>
    </fieldset>
  );
}
