import { tr } from "../i18n";

export function ScoreExplanation({ legacy = false }: { legacy?: boolean }) {
  return (
    <details className="sport-score-explained">
      <summary>{tr("how_is_the_score_calculated")}</summary>
      {legacy ? <p>{tr("score_legacy")}</p> : (
        <>
          <p>{tr("score_formula")}</p>
          <p>{tr("score_reference_policy")}</p>
          <p>{tr("score_volume_formula")}</p>
          <p>{tr("score_pace_formula")}</p>
          <p>{tr("score_limits")}</p>
        </>
      )}
    </details>
  );
}
