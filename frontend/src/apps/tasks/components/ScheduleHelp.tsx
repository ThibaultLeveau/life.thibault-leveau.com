const examples = [
  ["Un intervalle", "tous les deux jours"],
  ["Une composition", "tous les mercredis toutes les trois semaines"],
  ["Plusieurs jours", "du lundi au vendredi une semaine sur deux"],
  ["Des dates dans le mois", "les 1er et 21 de chaque mois"],
  ["Une position", "le dernier jour ouvré de chaque mois"],
  ["Une fin et des exceptions", "tous les jours pour cinq fois sauf demain"],
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
      <summary>Les raccourcis en français</summary>
      <p>
        Combinez un rythme, des jours, une fin ou des exceptions. Les nombres
        peuvent s’écrire en lettres.
      </p>
      <dl>
        {examples.map(([label, example]) => (
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
      <p>
        Vérifiez toujours l’aperçu. Pour conserver des mots tels quels,
        entourez-les de « guillemets » ou choisissez de garder le texte.
      </p>
    </details>
  );
}
