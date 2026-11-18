import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const here = (path) => new URL(path, import.meta.url);
const read = (path) => readFileSync(here(path), 'utf8');
const write = (path, content) => writeFileSync(here(path), content.replace(/[ \t]+$/gm, ''));
const version = (path) => createHash('sha256').update(read(path)).digest('hex').slice(0, 12);
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));
const validLink = (value) => {
  if (new URL(value).protocol !== 'https:') throw new Error('Project links must use HTTPS');
  return esc(value);
};

const data = JSON.parse(read('./projects.json'));
const overviews = JSON.parse(read('./project-overviews.json'));
const photos = JSON.parse(read('./project-photos.json'));
const skillAreas = data.skillAreas;
const knownSkills = new Set(skillAreas);
if (knownSkills.size !== skillAreas.length) throw new Error('Duplicate skill area names.');
const groupMeta = {
  'politics-business': {
    id: 'politics', nav: 'Politics & Business', subtitle: 'Public life, policy, and markets.',
    cover: { file: 'politics-business.png', width: 738, height: 414 },
    description: 'Explore how institutions, policy, and markets shape public life.',
    icon: '<path d="M4 18h24M6 15h20M8 12V8m5 4V8m6 4V8m5 4V8M5 6l11-5 11 5z"/>',
  },
  sports: {
    id: 'sports', nav: 'Sports & Games', subtitle: 'Competition, play, and performance.',
    cover: { file: 'sports-games.png', width: 1920, height: 1080 },
    description: 'A look at how people play, compete, and measure performance.',
    icon: '<ellipse cx="16" cy="10" rx="13" ry="8"/><path d="M12 6h8v8h-8zm2 2h4m-4 4h4"/>',
  },
  entertainment: {
    id: 'entertainment', nav: 'Entertainment & Videos', subtitle: 'Media, storytelling, and culture.',
    cover: { file: 'entertainment-videos.png', width: 738, height: 414 },
    description: 'Discover how stories are made, shared, and experienced.',
    icon: '<rect x="4" y="6" width="24" height="13" rx="2"/><path d="M4 10h24M9 6l3 4m5-4 3 4m5-4 3 4m-14 2 6 2.5-6 2.5z"/>',
  },
};

const groups = data.groups.map((g) => {
  const meta = groupMeta[g.id];
  if (!meta || !g.projects.length) throw new Error(`Unknown or empty topic: ${g.id}`);
  return { ...g, ...meta };
});
const ids = new Set();
const artifacts = new Set();
const missingGraphics = [];
const arrow = '<span aria-hidden="true">↗</span>';
const newTab = '<span class="sr-only"> (opens a new tab)</span>';
const featuredLabel = '<p class="featured-project-label">Featured Project</p>';
const icon = (g) => `<svg viewBox="0 0 32 21" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round">${g.icon}</svg>`;
const projectCount = (n) => `${n} ${n === 1 ? 'project' : 'projects'}`;
const projectPage = (p) => `project-${p.id}.html`;
const renderTools = (p) => `<div class="tags">${p.tech.map((t) => `<span>${esc(t)}</span>`).join('')}</div>`;
const renderLink = (a, title) =>
  `<li><a href="${validLink(a.url)}" target="_blank" rel="noopener">${esc(a.label)} ${arrow}<span class="sr-only"> for ${esc(title)} (opens a new tab)</span></a></li>`;
const renderSelect = (id, label, all, options) =>
  `<div class="catalog-filter"><label for="${id}">${label}</label><select id="${id}"><option value="">${all}</option>${options.map((option) => `<option value="${esc(option)}">${esc(option)}</option>`).join('')}</select></div>`;
const renderImage = (image, eager) =>
  `<img${image.file ? ' class="project-photo"' : ''} src="${esc(image.src)}" alt="${esc(image.alt)}" width="${image.width}" height="${image.height}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'}>`;

function projectImage(p) {
  const photo = photos[p.id];
  if (photo) {
    const src = photo.root ? photo.file : `assets/project-photos/${photo.file}`;
    if (!/^[a-z0-9-]+\.(?:jpe?g|webp|png)$/.test(photo.file) || !existsSync(here(`./dist/${src}`)) ||
        !Number.isSafeInteger(photo.width) || photo.width <= 0 ||
        !Number.isSafeInteger(photo.height) || photo.height <= 0 ||
        typeof photo.alt !== 'string' || !photo.alt.trim()) {
      throw new Error(`Invalid project photo: ${p.id}`);
    }
    return { ...photo, src };
  }
  const src = `assets/projects/${p.id}.svg`;
  const path = `./dist/${src}`;
  let alt = `Illustration for ${p.title}`;
  if (existsSync(here(path))) {
    const description = read(path).match(/<desc\b[^>]*>([^<]+)<\/desc>/)?.[1]?.trim();
    if (description) alt = description.replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  } else missingGraphics.push(p.id);
  return { src, alt, width: 720, height: 440 };
}

function renderProject(p, group, featured) {
  if (!/^[a-z][a-z0-9-]*$/.test(p.id) || ids.has(p.id)) throw new Error(`Invalid or duplicate project ID: ${p.id}`);
  ids.add(p.id);
  if (!p.artifacts?.length) throw new Error(`Missing source link: ${p.id}`);
  if (!Array.isArray(p.skills) || !p.skills.length || new Set(p.skills).size !== p.skills.length ||
      p.skills.some((skill) => !knownSkills.has(skill))) {
    throw new Error(`Invalid skill areas for project: ${p.id}`);
  }
  for (const artifact of p.artifacts) {
    if (artifacts.has(artifact.url)) throw new Error(`Duplicate project artifact: ${artifact.url}`);
    artifacts.add(artifact.url);
  }
  const image = projectImage(p);
  const [main, ...rest] = p.artifacts;
  writeProjectOverview(p, group, image, featured);
  return `<article class="topic-project${featured ? ' lead-project' : ''}" id="project-${esc(p.id)}" data-project data-tools="${esc(p.tech.join('|'))}" data-skills="${esc(p.skills.join('|'))}">
  <div class="project-graphic">${renderImage(image, featured)}</div>
  <div class="topic-project-copy">
    ${featured ? featuredLabel : ''}
    <h3><a href="${projectPage(p)}">${esc(p.title)}</a></h3>
    <p>${esc(p.description)}</p>
    ${renderTools(p)}
    <div class="project-card-actions">
      <a class="button button-dark" href="${projectPage(p)}" aria-label="Overview of ${esc(p.title)}">Overview</a>
      <ul class="project-artifacts">${renderLink(main, p.title)}</ul>
    </div>
    ${rest.length ? `<details class="supporting-files"><summary>${rest.length} supporting ${rest.length === 1 ? 'file' : 'files'}</summary><ul class="project-artifacts">${rest.map((a) => renderLink(a, p.title)).join('')}</ul></details>` : ''}
  </div>
</article>`;
}

const directory = `<nav class="topic-directory" aria-label="Project topics">${groups.map((g) =>
  `<a class="directory-card" data-theme="${g.id}" href="${g.id}.html">
    <div class="directory-card-copy">
      <h3>${esc(g.label)}</h3>
      <p>${esc(g.subtitle)}</p>
      <span class="directory-count">${projectCount(g.projects.length)} ${arrow}</span>
    </div>
    <img class="directory-cover" src="assets/topics/${g.cover.file}" alt="" width="${g.cover.width}" height="${g.cover.height}" loading="lazy">
  </a>`).join('\n')}</nav>`;
const boundary = /<!-- TOPICS_START -->[\s\S]*?<!-- TOPICS_END -->/;
const home = read('./dist/index.html');
if (!boundary.test(home)) throw new Error('Topic boundaries are missing from dist/index.html');
write('./dist/index.html', home.replace(boundary, () => `<!-- TOPICS_START -->\n${directory}\n<!-- TOPICS_END -->`));

const collections = `<details class="source-collections"><summary>Browse original source collections</summary>
  <ul>${data.collections.map((a) => `<li><a href="${validLink(a.url)}" target="_blank" rel="noopener">${esc(a.label)} ${arrow}${newTab}</a></li>`).join('')}</ul>
</details>`;
const brand = `<a class="brand" href="index.html" aria-label="Daniel Nguyen, home"><span class="brand-mark" aria-hidden="true">dn<span>↗</span></span><span>Daniel Nguyen</span></a>`;
const sharedStyles = `<link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="topics.css?v=${version('./dist/topics.css')}">
  <link rel="stylesheet" href="dark.css"><link rel="stylesheet" href="collection-dark.css">
  <link rel="stylesheet" href="project-overview.css">`;
const siteHeader = `<header class="site-header">
    ${brand}
    <button class="menu-button" aria-expanded="false" aria-controls="main-nav">Menu <span aria-hidden="true">+</span></button>
    <nav id="main-nav" class="main-nav" aria-label="Main navigation">
      <a href="index.html#work">Projects</a><a href="index.html#skills">Skills</a>
      <a href="resume.html">Full résumé</a>
      <a class="nav-contact" href="index.html#contact">Contact ${arrow}</a>
    </nav>
  </header>`;

function writeProjectOverview(p, group, image, featured) {
  const details = overviews[p.id]?.details;
  if (!Array.isArray(details) || details.length === 0 || details.some((detail) => typeof detail !== 'string' || !detail.trim())) {
    throw new Error(`Missing overview for project: ${p.id}`);
  }
  const collectionLink = `${group.id}.html#project-${p.id}`;
  const imageCredit = image.source && image.credit
    ? `<p class="section-shell project-image-credit"><a href="${validLink(image.source)}">${esc(image.credit)}</a>${image.license ? ` · <a href="${validLink(image.license)}">License</a>` : ''}</p>`
    : '';
  write(`./dist/${projectPage(p)}`, `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#080808">
  <title>${esc(p.title)} Overview — Daniel Nguyen</title>
  <meta name="description" content="${esc(p.description)}">
  <link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
  ${sharedStyles}
  <script src="app.js" defer></script>
</head>
<body class="topic-page project-page" data-theme="${group.id}">
  <a class="skip-link" href="#main">Skip to content</a>
  ${siteHeader}
  <main id="main">
    <section class="case-intro section-shell" aria-labelledby="project-title">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <a href="index.html#work">Projects</a><span aria-hidden="true">/</span>
        <a href="${collectionLink}">${esc(group.label)}</a>
      </nav>
      ${featured ? featuredLabel : ''}
      <h1 id="project-title">${esc(p.title)}</h1>
      <section class="project-overview-summary" aria-labelledby="overview-heading">
        <h2 id="overview-heading">Overview</h2>
        ${details.map((detail) => `<p>${esc(detail)}</p>`).join('\n        ')}
      </section>
    </section>
    <div class="case-art section-shell project-overview-art">
      ${renderImage(image, true)}
    </div>
    ${imageCredit}
    <div class="section-shell project-overview-resources">
      <section aria-labelledby="tools-heading">
        <h2 id="tools-heading">Tools</h2>
        ${renderTools(p)}
      </section>
      <section aria-labelledby="files-heading">
        <h2 id="files-heading">Project files</h2>
        <ul class="project-artifacts">
          ${p.artifacts.map((a) => renderLink(a, p.title)).join('\n          ')}
        </ul>
      </section>
    </div>
  </main>
  <footer class="site-footer section-shell">
    <span>© <span data-year>2026</span> Daniel Nguyen</span>
    <div><a href="${collectionLink}">Back to ${esc(group.label)}</a><a href="index.html#contact">Contact</a></div>
  </footer>
</body>
</html>
`);
}

for (const g of groups) {
  const tools = [...new Set(g.projects.flatMap((p) => p.tech))].sort();
  const tabs = `<nav class="topic-tabs section-shell" aria-label="Project topics">
    <a class="tabs-home" href="index.html#work">← All topics</a>
    ${groups.map((tab) => `<a href="${tab.id}.html"${tab.id === g.id ? ' aria-current="page"' : ''}>${esc(tab.nav)}</a>`).join('')}
  </nav>`;
  const projects = g.projects.map((p, j) => renderProject(p, g, j === 0)).join('\n');
  write(`./dist/${g.id}.html`, `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#080808">
  <title>${esc(g.label)} — Daniel Nguyen</title>
  <meta name="description" content="${esc(g.description)}">
  <link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
  ${sharedStyles}
  <script src="app.js?v=${version('./dist/app.js')}" defer></script>
</head>
<body class="topic-page" data-theme="${g.id}">
  <a class="skip-link" href="#main">Skip to content</a>
  ${siteHeader}
  <main id="main">
    <section class="topic-banner" aria-labelledby="topic-title">
      <div class="section-shell topic-banner-inner">
        <span class="topic-banner-icon">${icon(g)}</span>
        <h1 id="topic-title">${esc(g.label)}</h1>
        <p class="topic-banner-description">${esc(g.description)}</p>
        <a class="topic-down" href="#project-browser" aria-label="Go to projects">↓</a>
      </div>
    </section>
    ${tabs}
    <section class="section-shell topic-page-body" id="project-browser" aria-labelledby="project-list-title" data-catalog>
      <div class="catalog-header">
        <h2 id="project-list-title" tabindex="-1">Projects</h2>
        <div class="catalog-controls" hidden>
          ${tools.length ? renderSelect('tool-filter', 'Tool', 'All tools', tools) : ''}
          ${renderSelect('skill-filter', 'Skill area', 'All skill areas', skillAreas)}
          <div class="work-search">
            <label for="project-search">Find a project</label>
            <div class="search-control"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input id="project-search" type="search" placeholder="Search this collection" autocomplete="off"><button id="clear-search" type="button" hidden>Clear</button></div>
          </div>
        </div>
      </div>
      <p class="result-status" id="result-status" role="status" aria-live="polite">${projectCount(g.projects.length)}</p>
      <div class="topic-grid" id="project-grid">${projects}</div>
      <div class="empty-state" id="empty-state" hidden><h3>No projects match these filters.</h3><p>Try a different search, tool, or skill area.</p><button class="button button-dark" id="reset-projects" type="button">Clear filters</button></div>
      <nav class="catalog-pagination" aria-label="Project pages" hidden>
        <button class="button" type="button" data-page-prev>← Previous</button>
        <div><label for="project-page">Jump to page</label><select id="project-page"></select></div>
        <button class="button" type="button" data-page-next>Next →</button>
      </nav>
      ${collections}
    </section>
  </main>
  <footer class="site-footer section-shell"><span>© <span data-year>2026</span> Daniel Nguyen</span><div><a href="index.html#work">All topics</a><a href="index.html#contact">Contact</a></div></footer>
</body>
</html>
`);
}
console.log(`Built ${ids.size} project overviews and ${groups.length} topic pages with ${artifacts.size} unique artifact links.`);
if (missingGraphics.length) {
  console.log(`Graphics pending: ${missingGraphics.join(', ')}`);
  if (process.argv.includes('--check-art')) process.exitCode = 1;
}
