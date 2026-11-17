"""Explicit shared capabilities, owned by the coordinator rather than any application."""

from pydantic import Field, TypeAdapter

from life_app.platform.applications import schemas as apps_schema
from life_app.platform.applications import service as apps
from life_app.platform.assistant.definition import ActionDefinition, ActionProvider, arguments
from life_app.platform.assistant.service import fingerprint
from life_app.platform.auth import service as auth
from life_app.platform.auth.schemas import Preferences
from life_app.platform.integrations import schemas as integration_schema
from life_app.platform.integrations import service as integrations
from life_app.platform.progression import schemas as progression_schema
from life_app.platform.progression import service as progression


def action(name, description, method, path, output_model, handler, *, precondition=None, **fields):
    def execute(context, payload):
        result = handler(context, payload)
        context.db.flush()
        return TypeAdapter(output_model).validate_python(result, from_attributes=True)

    return ActionDefinition(
        name,
        description,
        arguments("LifeOS" + name.title().replace("_", ""), **fields),
        execute,
        method,
        path,
        mutating=method == "PUT",
        output_model=output_model,
        precondition=precondition,
        labels=tuple(description.split(" / ")),
    )


def set_preferences(context, payload):
    return auth.save_preferences(context.user, payload.payload)


def activation_fingerprint(context, payload):
    apps.find_application(context.definitions, payload.application_id)
    current = next(
        item
        for item in apps.catalogue(context.db, context.user, context.definitions)
        if item.id == payload.application_id
    )
    return fingerprint((current.enabled, current.updated_at))


provider = ActionProvider(
    actions=(
        action(
            "applications",
            "Applications disponibles / Available applications",
            "GET",
            "/applications",
            list[apps_schema.ApplicationOutput],
            lambda c, p: apps.catalogue(c.db, c.user, c.definitions),
        ),
        action(
            "set_application",
            "Activation d’une application / Application activation",
            "PUT",
            "/applications/{application_id}",
            apps_schema.ApplicationOutput,
            lambda c, p: apps.set_activation(
                c.db, c.user, apps.find_application(c.definitions, p.application_id), p.enabled
            ),
            precondition=activation_fingerprint,
            application_id=(str, Field(min_length=1, max_length=50)),
            enabled=(bool, ...),
        ),
        action(
            "preferences",
            "Langue et thème / Language and theme",
            "GET",
            "/preferences",
            Preferences,
            lambda c, p: c.user,
        ),
        action(
            "save_preferences",
            "Modifier langue et thème / Change language and theme",
            "PUT",
            "/preferences",
            Preferences,
            set_preferences,
            precondition=lambda c, p: fingerprint(
                {key: getattr(c.user, key) for key in p.payload.model_fields_set}
            ),
            payload=(Preferences, ...),
        ),
        action(
            "progression_settings",
            "Fuseau, vacances et jours actifs / Timezone and active days",
            "GET",
            "/progression/settings",
            progression_schema.SettingsOutput,
            lambda c, p: progression.settings(c.db, c.user),
        ),
        action(
            "save_progression_settings",
            "Préférences de progression / Progression preferences",
            "PUT",
            "/progression/settings",
            progression_schema.SettingsOutput,
            lambda c, p: progression.save_settings(c.db, c.user, c.definitions, p.payload),
            payload=(progression_schema.SettingsWrite, ...),
        ),
        action(
            "progression_summary",
            "Niveau et série / Level and streak",
            "GET",
            "/progression/{application_id}",
            progression_schema.Summary,
            lambda c, p: progression.summary(
                c.db, c.user, progression.definition(c.db, c.user, c.definitions, p.application_id)
            ),
            application_id=(str, ...),
        ),
        action(
            "progression_history",
            "Journal des gains / Progress history",
            "GET",
            "/progression/{application_id}/history",
            progression_schema.History,
            lambda c, p: progression.history(
                c.db,
                c.user,
                progression.definition(c.db, c.user, c.definitions, p.application_id),
                p.offset,
                p.limit,
            ),
            application_id=(str, ...),
            offset=(int, Field(default=0, ge=0, le=100000)),
            limit=(int, Field(default=20, ge=1, le=100)),
        ),
        action(
            "integrations",
            "Sources de métriques / Metric sources",
            "GET",
            "/integrations",
            list[integration_schema.SourceDefinition],
            lambda c, p: integrations.catalogue(c.db, c.user, c.definitions),
        ),
        action(
            "integration_options",
            "Options de métrique / Metric filter options",
            "GET",
            "/integrations/{application_id}/options/{filter_id}",
            integration_schema.OptionPage,
            lambda c, p: integrations.provider(
                c.db, c.user, c.definitions, p.application_id
            ).options(c.db, c.user, p.filter_id, p.q, p.offset, p.limit),
            application_id=(str, ...),
            filter_id=(str, ...),
            q=(str, Field(default="", max_length=160)),
            offset=(int, Field(default=0, ge=0, le=100000)),
            limit=(int, Field(default=30, ge=1, le=100)),
        ),
        action(
            "evaluate_metric",
            "Aperçu de métrique / Preview a metric",
            "POST",
            "/integrations/evaluate",
            integration_schema.Evaluated,
            lambda c, p: integration_schema.Evaluated(
                query=p.payload,
                result=integrations.evaluate(c.db, c.user, c.definitions, p.payload),
            ),
            payload=(integration_schema.Evaluation, ...),
        ),
    )
)
