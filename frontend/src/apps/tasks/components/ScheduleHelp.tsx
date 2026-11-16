import { tr } from "../i18n";
const examples = () => [
  [tr("an_interval"), tr("every_two_days")],
  [tr("a_combination"), tr("every_wednesday_every_three_weeks")],
  [tr("several_days"), tr("every_other_week_on_monday_through_friday")],
  [tr("dates_in_the_month"), tr("every_1st_and_21st_of_the_month")],
  [tr("a_position"), tr("every_last_business_day_of_the_month")],
  [
    tr("an_ending_and_exceptions"),
    tr("every_day_for_five_times_except_tomorrow"),
  ],
];

export function ScheduleHelp({
  onChoose,
  disabled = false,
}: {
  onChoose?: (text: string) => void;
  disabled?: boolean;
}) {
  return (
    <details className="schedule-help">
      <summary>{tr("natural_language_shortcuts")}</summary>
      <p>
        {tr("combine_a_repeat_interval_days_an_ending_or_exceptions_numbers")}
      </p>
      <dl>
        {examples().map(([label, example]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              {onChoose ? (
                <button
                  type="button"
                  className="text-button"
                  disabled={disabled}
                  onClick={() => onChoose(example)}
                >
                  {example}
                </button>
              ) : (
                example
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p>{tr("always_check_the_preview_to_keep_words_unchanged_put_them")}</p>
    </details>
  );
}
