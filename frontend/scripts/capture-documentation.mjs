// Real screenshots of synthetic accounts. Run via scripts/capture-documentation.sh.
import { chromium, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const baseURL = process.env.LIFE_DOCS_URL;
if (!baseURL || !['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname))
  throw new Error('Documentation capture requires an explicit loopback test server');
const stateDirectory = process.env.LIFE_DOCS_STATE_DIR;
if (!stateDirectory) throw new Error('Use scripts/capture-documentation.sh for an isolated seed directory');
const root = fileURLToPath(new URL('../../docs/assets/screenshots/', import.meta.url));
const browser = await chromium.launch({ headless: true });
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
const day = (offset) => {
  const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
try {
  for (const locale of ['fr', 'en']) {
    const fr = locale === 'fr', t = (a, b) => fr ? a : b;
    const context = await browser.newContext({ baseURL, locale: fr ? 'fr-FR' : 'en-GB',
      timezoneId: 'Europe/Paris', viewport: { width: 1360, height: 920 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await mkdir(`${root}/${locale}`, { recursive: true });
    const capture = async (name, route, prepare) => {
      if (route) {
        const response = await page.goto(route, { waitUntil: 'networkidle' });
        if (!response?.ok()) throw new Error(`Capture ${name}: HTTP ${response?.status()}`);
      }
      if (route === '/api/docs') await expect(page.locator('.swagger-ui .opblock').first()).toBeVisible();
      else await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      if (prepare) await prepare();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${root}/${locale}/${name}.png`, animations: 'disabled' });
      console.log(`${locale}/${name}.png`);
    };
    await capture('general-login', '/tasks');
    const login = await context.request.post('/api/v1/auth/session', { data: {
      username: `documentation-${locale}`, password: 'synthetic-documentation-password' } });
    if (!login.ok()) throw new Error('Synthetic login failed');
    const headers = { 'X-CSRF-Token': (await login.json()).csrf_token };
    const api = async (method, path, data) => {
      const r = await context.request.fetch(`/api/v1${path}`, { method, headers, data });
      if (!r.ok()) throw new Error(`${method} ${path}: ${r.status()} ${await r.text()}`);
      return r.status() === 204 ? undefined : r.json();
    };
    await api('PUT', '/preferences', { locale, theme: 'light' });
    for (const id of ['tasks', 'sport', 'tracking', 'okr', 'recipes'])
      await api('PUT', `/applications/${id}`, { enabled: true });
    // Reuse only these dedicated demo accounts if a capture needs to be repeated.
    const statePath = `${stateDirectory}/documentation-${locale}.json`;
    let data;
    try { data = JSON.parse(await readFile(statePath, 'utf8')); } catch { /* Fresh database. */ }
    if (data && !(await context.request.get(`/api/v1/workspaces/${data.space.id}`)).ok()) data = null;
    if (!data) {
      const space = await api('POST', '/workspaces', { name: t('Mon quotidien', 'My everyday life'), color: '#397d68' });
      await api('POST', '/workspaces', { name: t('Maison', 'Home'), parent_id: space.id });
      const section = await api('POST', `/workspaces/${space.id}/sections`, { name: t('Cette semaine', 'This week') });
      const label = await api('POST', `/workspaces/${space.id}/labels`, { name: t('Personnel', 'Personal'), color: '#397d68' });
      const tasks = [];
      for (const [i, title] of [t('Préparer le week-end', 'Plan the weekend'), t('Lire vingt pages', 'Read twenty pages'), t('Réserver le rendez-vous', 'Book the appointment')].entries())
        tasks.push(await api('POST', '/tasks', { workspace_id: space.id, section_id: section.id, title,
          description: t('Prendre un moment pour avancer sereinement.', 'Take a moment to make steady progress.'),
          due_date: day(i), priority: i + 1, label_ids: [label.id] }));
      const completed = await api('POST', '/tasks', { workspace_id: space.id, title: t('Ranger le bureau', 'Tidy the desk') });
      await api('POST', `/tasks/${completed.id}/complete`, { expected_version: completed.version });
      const tracker = await api('POST', '/tracking/trackers', { name: t('Mon équilibre', 'My daily balance'),
        frequency: 'daily', timezone: 'Europe/Paris', start_date: day(-20), fields: [
          { id: 'water', label: t('Eau bue', 'Water'), unit: 'L', goal: { mode: 'at_least', target: 2, tolerance: 2 } },
          { id: 'walk', label: t('Prendre l’air', 'Go outside'), kind: 'boolean', goal: { mode: 'equals', target: true } }] });
      for (let i = -16; i < 0; i++) if (i % 5 !== 0)
        await api('PUT', `/tracking/trackers/${tracker.id}/entries/${day(i)}`, {
          expected_version: 0, complete: true, values: { water: 1 + (Math.abs(i) % 3) / 2, walk: i % 3 !== 0 } });
      const exercise = (await api('GET', `/sport/exercises?kind=weight_reps&q=${encodeURIComponent(t('développé couché', 'bench press'))}`)).items[0];
      const program = await api('POST', '/sport/workouts', { name: t('Force et régularité', 'Strength and consistency'),
        notes: t('Deux séries, puis un temps de récupération.', 'Two sets, then time to recover.'),
        entries: [{ exercise_id: exercise.id, sets: 2, target: { weight_kg: 40, reps: 10 } }] });
      let training = await api('POST', '/sport/sessions', { workout_id: program.id, expected_version: program.version });
      for (let i = 0; i < 2; i++) training = await api('PUT', `/sport/sessions/${training.id}/sets/0/${i}`, {
        expected_version: training.version, values: { weight_kg: 40, reps: 10 } });
      await api('PUT', `/sport/sessions/${training.id}/finish`, { expected_version: training.version, outcome: 'completed' });
      training = await api('POST', '/sport/sessions', { workout_id: program.id, expected_version: program.version });
      await api('PUT', `/sport/sessions/${training.id}/sets/0/0`, { expected_version: training.version, values: { weight_kg: 42.5, reps: 10 } });
      for (const i of [-14, -7, 0]) await api('POST', '/sport/measurements', { measured_on: day(i), weight_kg: 75 + Math.abs(i) / 14, waist_cm: 84 + Math.abs(i) / 7 });
      let parent = null, goal;
      for (const [horizon, title] of [['ten_year', t('Une vie active et équilibrée', 'An active, balanced life')],
        ['three_year', t('Construire des habitudes durables', 'Build lasting habits')],
        ['annual', t('Bouger toute l’année', 'Stay active all year')],
        ['quarterly', t('Installer ma routine de marche', 'Establish my walking routine')]]) {
        goal = await api('POST', '/okr/objectives', { title, horizon, parent_id: parent, domain: 'personal',
          why: t('Préserver mon énergie au quotidien', 'Keep my everyday energy'), outcome: t('Marcher régulièrement', 'Walk regularly'),
          first_action: t('Choisir deux créneaux cette semaine', 'Choose two time slots this week'),
          ...(horizon === 'quarterly' ? { start_date: today, due_date: day(20), key_results: [
            { title: t('Sorties à pied', 'Walks'), start: 0, target: 8, current: 3, unit: t('sorties', 'walks') }] } : {}) });
        parent = goal.id;
      }
      goal = await api('PUT', `/okr/objectives/${goal.id}/move`, { expected_version: goal.version, status: 'in_progress', position: 0 });
      const rice = (await api('GET', '/recipes/ingredients?q=riz%20basmati')).items[0];
      const tomato = (await api('GET', '/recipes/ingredients?q=tomate')).items[0];
      const oil = (await api('GET', '/recipes/ingredients?q=huile')).items[0];
      const recipe = await api('POST', '/recipes/recipes', { title: t('Riz aux tomates', 'Tomato rice'), servings: 2,
        instructions: t('Faire revenir les tomates dans l’huile. Ajouter le riz, couvrir d’eau et laisser mijoter.', 'Soften the tomatoes in the oil. Add the rice, cover with water and simmer.'),
        items: [{ ingredient_id: rice.id, quantity: '150', unit: 'g' }, { ingredient_id: tomato.id, quantity: '2', unit: 'u' }, { ingredient_id: oil.id, quantity: '1', unit: 'tbsp' }] });
      let list = await api('POST', '/recipes/lists', { title: t('Courses du week-end', 'Weekend shopping') });
      list = await api('POST', `/recipes/lists/${list.id}/import`, { expected_version: list.version, recipe_id: recipe.id, recipe_version: recipe.version, servings: 4 });
      list = await api('PUT', `/recipes/lists/${list.id}/items/${list.items[0].id}/check`, { expected_version: list.version, checked: true });
      const template = await api('POST', `/recipes/lists/${list.id}/copy`, { expected_version: list.version, kind: 'template', title: t('Mes essentiels', 'My essentials') });
      data = { space, tasks, tracker, program, goal, recipe, list, template };
      await writeFile(statePath, JSON.stringify(data));
    }
    await capture('general-library', '/applications');
    await capture('general-home', '/');
    await capture('general-progress', '/tracking?tab=achievements');
    await capture('general-settings', '/tracking?tab=settings');
    await api('PUT', `/workspaces/${data.space.id}/view`, { layout: 'list', show_completed: true });
    await capture('tasks-list', `/tasks?space=${data.space.id}`);
    await api('PUT', `/workspaces/${data.space.id}/view`, { layout: 'board', show_completed: true });
    await capture('tasks-board', `/tasks?space=${data.space.id}`);
    await capture('tasks-agenda', '/tasks?view=agenda');
    await capture('sport-programs', '/sport');
    await capture('sport-editor', `/sport?tab=workouts&program=${data.program.id}`);
    await capture('sport-training', '/sport?tab=training');
    await capture('sport-catalogue', '/sport?tab=exercises');
    await capture('sport-measurements', '/sport?tab=measurements');
    await capture('sport-statistics', '/sport?tab=statistics');
    await capture('tracking-today', '/tracking');
    await capture('tracking-editor', `/tracking?tab=trackers&edit=${data.tracker.id}`);
    await capture('tracking-calendar', '/tracking?tab=calendar');
    await capture('tracking-statistics', '/tracking?tab=statistics', async () => {
      await page.getByRole('combobox', { name: t('Mes suivis', 'My trackers'), exact: true }).selectOption(data.tracker.id);
      await page.waitForLoadState('networkidle');
    });
    await capture('okr-horizons', '/okr');
    await capture('okr-editor', `/okr?edit=${data.goal.id}`);
    await capture('okr-board', '/okr?tab=quarter');
    await capture('recipes-detail', `/recipes?tab=recipes&id=${data.recipe.id}`);
    await capture('recipes-list', `/recipes?tab=lists&id=${data.list.id}`);
    await capture('recipes-template', `/recipes?tab=templates&id=${data.template.id}`);
    await page.setViewportSize({ width: 390, height: 844 });
    await capture('recipes-shopping-mobile', `/recipes?tab=lists&id=${data.list.id}&shop=1`);
    await capture('general-navigation-mobile', '/sport', async () => {
      await page.getByRole('button', { name: t('Ouvrir la navigation', 'Open navigation'), exact: true }).click();
    });
    await capture('tracking-calendar-mobile', '/tracking?tab=calendar');
    await page.setViewportSize({ width: 1360, height: 920 });
    await capture('technical-api', '/api/docs');
    await context.close();
  }
} finally { await browser.close(); }
