from pathlib import Path

from life_app.core.i18n import Catalogue

tr = Catalogue(Path(__file__).with_name("locales"), "platform.applications")
