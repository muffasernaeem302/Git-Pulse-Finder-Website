/* ============================================================
   GitPulse — script.js
   Modular async GitHub Profile Visualizer
   ============================================================ */

'use strict';

/* ──────────────────────────────────────────────
   CONSTANTS & LANGUAGE COLOR MAP
────────────────────────────────────────────── */
const GITHUB_API = 'https://api.github.com';

const LANGUAGE_COLORS = {
  JavaScript:  '#f7df1e',
  TypeScript:  '#3178c6',
  Python:      '#3572a5',
  Java:        '#b07219',
  'C++':       '#f34b7d',
  'C#':        '#178600',
  C:           '#555555',
  PHP:         '#4f5d95',
  Ruby:        '#701516',
  Go:          '#00add8',
  Rust:        '#dea584',
  Swift:       '#fa7343',
  Kotlin:      '#a97bff',
  Dart:        '#00b4ab',
  HTML:        '#e44b23',
  CSS:         '#563d7c',
  Shell:       '#89e051',
  'Vim script':'#199f4b',
  Vue:         '#41b883',
  Svelte:      '#ff3e00',
  R:           '#198ce7',
  Scala:       '#c22d40',
  Haskell:     '#5e5086',
  Lua:         '#000080',
  MATLAB:      '#e16737',
  Jupyter:     '#da5b0b',
  Makefile:    '#427819',
  PowerShell:  '#012456',
  Dockerfile:  '#384d54',
  YAML:        '#cb171e',
  Elixir:      '#6e4a7e',
  Clojure:     '#db5855',
  OCaml:       '#3be133',
  Nix:         '#7e7eff',
  default:     '#6366f1',
};

/* ──────────────────────────────────────────────
   DOM ELEMENT REFS
────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

const els = {
  input:          $('usernameInput'),
  searchBtn:      $('searchBtn'),
  retryBtn:       $('retryBtn'),
  welcome:        $('welcomeState'),
  loader:         $('loader'),
  error:          $('errorState'),
  dashboard:      $('profileContainer'),
  loaderText:     $('loaderText'),
  errorTitle:     $('errorTitle'),
  errorMsg:       $('errorMessage'),
  // profile
  avatar:         $('profileAvatar'),
  name:           $('profileName'),
  login:          $('profileLogin'),
  bio:            $('profileBio'),
  meta:           $('profileMeta'),
  link:           $('profileLink'),
  // sections
  statsGrid:      $('statsGrid'),
  reposList:      $('reposList'),
  viewAllRepos:   $('viewAllRepos'),
  langChart:      $('languageChart'),
  devScore:       $('devScore'),
  devScoreLabel:  $('devScoreLabel'),
  devScoreBar:    $('devScoreBar'),
  scoreBreakdown: $('scoreBreakdown'),
  quickFacts:     $('quickFactsList'),
  // header viewing badge
  badge:          $('currentUserBadge'),
  badgeAvatar:    $('badgeAvatar'),
  badgeUsername:  $('badgeUsername'),
  // persona & card modal
  personaBadge:      $('personaBadge'),
  personaIcon:       $('personaIcon'),
  personaTitle:      $('personaTitle'),
  exportCardBtn:     $('exportCardBtn'),
  exportPdfReportBtn:$('exportPdfReportBtn'),
  devCardModal:      $('devCardModal'),
  closeDevCardModal: $('closeDevCardModal'),
  downloadCardBtn:   $('downloadCardBtn'),
  downloadPdfBtn:    $('downloadPdfBtn'),
  copyCardBtn:       $('copyCardBtn'),
  shareLinkBtn:      $('shareLinkBtn'),
};

let currentProfile = null;

/* ──────────────────────────────────────────────
   STATE MACHINE — show only one view at a time
────────────────────────────────────────────── */
function showState(state) {
  // welcome / loader / error  → centered flex column
  // dashboard                 → normal block (vertical stack)
  const states = {
    welcome:   { el: els.welcome,   display: 'flex'  },
    loader:    { el: els.loader,    display: 'flex'  },
    error:     { el: els.error,     display: 'flex'  },
    dashboard: { el: els.dashboard, display: 'block' },
  };

  Object.entries(states).forEach(([key, { el, display }]) => {
    if (key === state) {
      el.classList.remove('hidden', 'flex', 'block');
      el.classList.add(display);
    } else {
      el.classList.remove('flex', 'block');
      el.classList.add('hidden');
    }
  });

  // Show header "Viewing" badge only when dashboard is active
  if (state === 'dashboard') {
    els.badge.classList.remove('hidden');
    els.badge.classList.add('flex');
  } else {
    els.badge.classList.add('hidden');
    els.badge.classList.remove('flex');
  }
}

/* ──────────────────────────────────────────────
   UTILITY HELPERS
────────────────────────────────────────────── */
function formatNumber(n) {
  if (n === null || n === undefined) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1)     + 'k';
  return n.toLocaleString();
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getLangColor(lang) {
  return LANGUAGE_COLORS[lang] || LANGUAGE_COLORS.default;
}

function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ──────────────────────────────────────────────
   SEARCH HISTORY ENGINE  (localStorage)
────────────────────────────────────────────── */
const HISTORY_KEY = 'gitpulse_history';
const HISTORY_MAX = 8;

function historyLoad() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}

function historySave(entries) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
}

/** Add or bump a user to the top of history */
function historyPush(user) {
  let entries = historyLoad();
  // Remove existing entry for same login
  entries = entries.filter(e => e.login.toLowerCase() !== user.login.toLowerCase());
  // Prepend newest
  entries.unshift({
    login:      user.login,
    name:       user.name || user.login,
    avatar_url: user.avatar_url,
    savedAt:    Date.now(),
  });
  // Keep max
  historySave(entries.slice(0, HISTORY_MAX));
}

/** Remove a single entry */
function historyRemove(login) {
  historySave(historyLoad().filter(e => e.login !== login));
}

/** Clear all */
function historyClear() {
  localStorage.removeItem(HISTORY_KEY);
}

/* ── Render the dropdown list ── */
function renderHistoryDropdown(filterText = '') {
  const list     = $('historyList');
  const section  = $('historySection');
  const dropdown = $('historyDropdown');
  const liveSec  = $('liveSuggestionsSection');
  let entries    = historyLoad();

  if (!list || !dropdown) return;

  if (filterText) {
    const q = filterText.toLowerCase();
    entries = entries.filter(e => 
      e.login.toLowerCase().includes(q) || 
      (e.name && e.name.toLowerCase().includes(q))
    );
  }

  if (!entries.length) {
    if (section) section.classList.add('hidden');
    if (!liveSec || liveSec.classList.contains('hidden')) {
      dropdown.classList.add('hidden');
    }
    return;
  }

  if (section) section.classList.remove('hidden');
  list.innerHTML = entries.map(e => `
    <li class="flex items-center gap-2.5 px-3.5 py-2 hover:bg-slate-800/60 cursor-pointer group transition-colors"
        data-login="${escapeHTML(e.login)}">
      <img src="${escapeHTML(e.avatar_url)}" alt=""
           class="w-6 h-6 rounded-full object-cover border border-slate-700 flex-shrink-0" />
      <div class="flex-1 min-w-0">
        <p class="text-xs font-semibold text-slate-200 truncate">${escapeHTML(e.name)}</p>
        <p class="text-[10px] text-slate-500">@${escapeHTML(e.login)}</p>
      </div>
      <button class="remove-history-item opacity-0 group-hover:opacity-100 transition-opacity text-slate-600 hover:text-red-400 p-1 rounded"
              data-login="${escapeHTML(e.login)}" title="Remove">
        <i class="fa-solid fa-xmark text-[10px] pointer-events-none"></i>
      </button>
    </li>
  `).join('');

  dropdown.classList.remove('hidden');
}

/* ── Render chips on the Welcome screen ── */
function renderWelcomeHistory() {
  const wrap    = $('welcomeHistory');
  const chipBox = $('welcomeHistoryList');
  const entries = historyLoad();

  if (!wrap || !chipBox) return;

  if (!entries.length) {
    wrap.classList.add('hidden');
    return;
  }

  wrap.classList.remove('hidden');
  chipBox.innerHTML = entries.map(e => `
    <button class="welcome-history-chip flex items-center gap-2 bg-slate-900 border border-slate-700
                   hover:border-indigo-500/50 rounded-full pl-1.5 pr-3.5 py-1.5 transition-all
                   group hover:bg-slate-800"
            data-login="${escapeHTML(e.login)}">
      <img src="${escapeHTML(e.avatar_url)}" alt=""
           class="w-6 h-6 rounded-full object-cover border border-slate-700" />
      <span class="text-xs font-semibold text-slate-300 group-hover:text-indigo-300 transition-colors">
        @${escapeHTML(e.login)}
      </span>
    </button>
  `).join('');
}

/* animated number counter */
function animateCount(el, target, duration = 800) {
  const start    = performance.now();
  const startVal = 0;

  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const ease     = 1 - Math.pow(1 - progress, 3);
    const current  = Math.round(startVal + (target - startVal) * ease);
    el.textContent = formatNumber(current);
    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = formatNumber(target);
  }
  requestAnimationFrame(step);
}

/* ──────────────────────────────────────────────
   SEARCH TRIGGER
────────────────────────────────────────────── */
async function handleSearch() {
  const username = els.input.value.trim();
  if (!username) {
    els.input.classList.add('border-red-500');
    els.input.focus();
    setTimeout(() => els.input.classList.remove('border-red-500'), 1200);
    return;
  }
  await fetchProfile(username);
}

/* ──────────────────────────────────────────────
   API FETCH — concurrent user + repos
────────────────────────────────────────────── */
async function fetchProfile(username) {
  showState('loader');
  els.loaderText.textContent = `Fetching @${username}…`;
  els.searchBtn.disabled     = true;

  try {
    const headers = { 'Accept': 'application/vnd.github+json' };

    const [userRes, reposRes] = await Promise.all([
      fetch(`${GITHUB_API}/users/${encodeURIComponent(username)}`,                                  { headers }),
      fetch(`${GITHUB_API}/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=30`,   { headers }),
    ]);

    // Handle error responses
    if (!userRes.ok) {
      if (userRes.status === 404) throw new Error('404');
      if (userRes.status === 403) throw new Error('403');
      throw new Error(String(userRes.status));
    }

    const [user, repos] = await Promise.all([userRes.json(), reposRes.json()]);

    renderDashboard(user, Array.isArray(repos) ? repos : []);

  } catch (err) {
    renderError(err, username);
  } finally {
    els.searchBtn.disabled = false;
  }
}

/* ──────────────────────────────────────────────
   SIMILAR USERS SEARCH (Suggestions on error / live)
────────────────────────────────────────────── */
async function fetchSimilarUsers(query) {
  if (!query || query.trim().length < 1) return [];
  const q = query.trim();

  async function search(term) {
    try {
      const res = await fetch(`${GITHUB_API}/search/users?q=${encodeURIComponent(term)}&per_page=5`, {
        headers: { 'Accept': 'application/vnd.github+json' }
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.items) ? data.items : [];
    } catch {
      return [];
    }
  }

  // 1. Direct query search
  let items = await search(q);
  if (items.length > 0) return items;

  // 2. Fallback for typos / extra trailing characters (e.g. "torvaldxxxyyy" -> "torvald")
  if (q.length > 4) {
    const prefix = q.slice(0, Math.max(3, Math.floor(q.length * 0.6)));
    items = await search(prefix);
    if (items.length > 0) return items;
  }

  return [];
}

let liveSearchDebounceTimer = null;

async function handleLiveSuggestions(query) {
  const liveSec     = $('liveSuggestionsSection');
  const liveList    = $('liveSuggestionsList');
  const liveSpinner = $('liveSuggestionsSpinner');
  const dropdown    = $('historyDropdown');
  if (!liveSec || !liveList) return;

  const q = query.trim();
  if (q.length < 2) {
    liveSec.classList.add('hidden');
    liveList.innerHTML = '';
    return;
  }

  if (liveSpinner) liveSpinner.classList.remove('hidden');
  liveSec.classList.remove('hidden');
  if (dropdown) dropdown.classList.remove('hidden');

  const users = await fetchSimilarUsers(q);

  if (liveSpinner) liveSpinner.classList.add('hidden');
  if (els.input.value.trim() !== q) return;

  if (users.length > 0) {
    liveList.innerHTML = users.map(u => `
      <li class="live-suggestion-item flex items-center justify-between px-3.5 py-2 hover:bg-slate-800/80 cursor-pointer group transition-colors"
          data-login="${escapeHTML(u.login)}">
        <div class="flex items-center gap-2.5 min-w-0">
          <img src="${escapeHTML(u.avatar_url)}" alt=""
               class="w-6 h-6 rounded-full object-cover border border-slate-700 flex-shrink-0" />
          <div class="min-w-0 text-left">
            <p class="text-xs font-semibold text-slate-200 group-hover:text-indigo-300 transition-colors truncate">
              @${escapeHTML(u.login)}
            </p>
          </div>
        </div>
        <span class="text-[10px] text-slate-500 group-hover:text-indigo-400 transition-colors flex items-center gap-1 font-medium">
          <span>Select</span>
          <i class="fa-solid fa-arrow-right text-[8px]"></i>
        </span>
      </li>
    `).join('');
    liveSec.classList.remove('hidden');
    dropdown.classList.remove('hidden');
  } else {
    liveList.innerHTML = `<li class="px-3.5 py-2.5 text-xs text-slate-500 text-center">No similar users found</li>`;
  }
}

/* ──────────────────────────────────────────────
   ERROR RENDERER
────────────────────────────────────────────── */
async function renderError(err, username = '') {
  const msg = err.message;
  const sugSection = $('errorSuggestions');
  const sugLoader  = $('errorSuggestionsLoader');
  const sugList    = $('errorSuggestionsList');

  if (msg === '404') {
    els.errorTitle.textContent = 'User Not Found';
    els.errorMsg.textContent   = username
      ? `No GitHub account found matching "@${escapeHTML(username)}". Choose a similar profile below or try another search.`
      : "The GitHub username you entered doesn't exist or couldn't be reached.";

    showState('error');

    if (username && sugSection && sugLoader && sugList) {
      sugSection.classList.add('hidden');
      sugLoader.classList.remove('hidden');

      const similarUsers = await fetchSimilarUsers(username);
      sugLoader.classList.add('hidden');

      if (similarUsers && similarUsers.length > 0) {
        sugList.innerHTML = similarUsers.map(user => `
          <li class="error-suggestion-chip flex items-center justify-between p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800/90 border border-slate-700/60 hover:border-indigo-500/60 cursor-pointer transition-all duration-200 group"
              data-login="${escapeHTML(user.login)}">
            <div class="flex items-center gap-3 min-w-0">
              <img src="${escapeHTML(user.avatar_url)}" alt=""
                   class="w-9 h-9 rounded-full object-cover border border-slate-700 flex-shrink-0 group-hover:border-indigo-400 transition-colors" />
              <div class="min-w-0 text-left">
                <p class="text-xs font-semibold text-slate-200 group-hover:text-indigo-300 transition-colors truncate">
                  @${escapeHTML(user.login)}
                </p>
                <p class="text-[10px] text-slate-500">GitHub ${escapeHTML(user.type || 'User')}</p>
              </div>
            </div>
            <div class="flex items-center gap-1.5 text-xs text-indigo-400 group-hover:text-white font-medium px-3 py-1.5 rounded-lg bg-indigo-500/10 group-hover:bg-indigo-600 transition-all flex-shrink-0">
              <span>Select</span>
              <i class="fa-solid fa-arrow-right text-[10px]"></i>
            </div>
          </li>
        `).join('');
        sugSection.classList.remove('hidden');
      } else {
        sugSection.classList.add('hidden');
      }
    }
  } else if (msg === '403') {
    if (sugSection) sugSection.classList.add('hidden');
    if (sugLoader)  sugLoader.classList.add('hidden');
    els.errorTitle.textContent = 'API Rate Limit Reached';
    els.errorMsg.textContent   = 'GitHub API rate limit exceeded. Please wait a few minutes before searching again.';
    showState('error');
  } else {
    if (sugSection) sugSection.classList.add('hidden');
    if (sugLoader)  sugLoader.classList.add('hidden');
    els.errorTitle.textContent = 'Network Error';
    els.errorMsg.textContent   = `Could not reach the GitHub API. Check your connection and try again. (${msg})`;
    showState('error');
  }
}

/* ──────────────────────────────────────────────
   FULL DASHBOARD RENDERER
────────────────────────────────────────────── */
function renderDashboard(user, repos) {
  renderHero(user);
  renderStats(user);
  renderRepos(repos, user.login);
  renderLanguages(repos);
  const devScore = renderDevScore(user, repos);
  const persona  = calculatePersona(user, repos, devScore);
  renderPersona(persona);
  currentProfile = { user, repos, devScore, persona };
  renderQuickFacts(user, repos);
  showState('dashboard');
  // Scroll to top of dashboard smoothly
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ──────────────────────────────────────────────
   DEVELOPER PERSONA CALCULATION & RENDERING
────────────────────────────────────────────── */
function calculatePersona(user, repos, devScore) {
  const langCounts = {};
  let totalStars = 0;
  repos.forEach(r => {
    if (r.language) {
      langCounts[r.language] = (langCounts[r.language] || 0) + 1;
    }
    totalStars += (r.stargazers_count || 0);
  });

  const topLangs = Object.keys(langCounts).sort((a, b) => langCounts[b] - langCounts[a]);
  const primaryLang = topLangs[0] || '';
  const totalLangs = topLangs.length;
  const yearsOnGitHub = user.created_at
    ? (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24 * 365.25)
    : 0;

  const isSystems = ['C', 'C++', 'Rust', 'Go', 'Assembly'].includes(primaryLang);
  const isFrontend = ['JavaScript', 'TypeScript', 'HTML', 'CSS', 'Vue', 'Svelte'].includes(primaryLang);
  const isDataAI = ['Python', 'Jupyter Notebook', 'R', 'Julia'].includes(primaryLang);
  const isMobile = ['Swift', 'Kotlin', 'Dart'].includes(primaryLang);
  const isBackend = ['Java', 'C#', 'PHP', 'Ruby', 'Go', 'Scala', 'Elixir'].includes(primaryLang);

  if (totalStars >= 1000 || user.followers >= 800) {
    return {
      title: 'Open-Source Titan',
      icon: 'fa-solid fa-crown',
      badgeClass: 'bg-amber-500/10 text-amber-300 border-amber-500/40',
      description: 'Creates high-impact software starred and relied upon by thousands across the ecosystem.'
    };
  }

  if (isSystems) {
    return {
      title: 'Systems Architect',
      icon: 'fa-solid fa-microchip',
      badgeClass: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/40',
      description: 'Masters low-level hardware, memory management, and high-performance computing.'
    };
  }

  if (isDataAI) {
    return {
      title: 'AI & Data Pioneer',
      icon: 'fa-solid fa-brain',
      badgeClass: 'bg-purple-500/10 text-purple-300 border-purple-500/40',
      description: 'Engineers machine learning pipelines, neural architectures, and intelligent data systems.'
    };
  }

  if (totalLangs >= 5) {
    return {
      title: 'Polyglot Prodigy',
      icon: 'fa-solid fa-layer-group',
      badgeClass: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40',
      description: 'Effortlessly bridges multiple paradigms and codes fluently across 5+ languages.'
    };
  }

  if (isFrontend) {
    return {
      title: 'Frontend Maestro',
      icon: 'fa-solid fa-palette',
      badgeClass: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/40',
      description: 'Crafts responsive interfaces, intuitive design systems, and delightful user experiences.'
    };
  }

  if (isMobile) {
    return {
      title: 'Mobile Craftsman',
      icon: 'fa-solid fa-mobile-screen',
      badgeClass: 'bg-rose-500/10 text-rose-300 border-rose-500/40',
      description: 'Specializes in native performance, mobile UX, and fluid cross-platform applications.'
    };
  }

  if (isBackend) {
    return {
      title: 'Cloud & API Engineer',
      icon: 'fa-solid fa-server',
      badgeClass: 'bg-blue-500/10 text-blue-300 border-blue-500/40',
      description: 'Architects robust distributed services, resilient databases, and scalable backend infrastructure.'
    };
  }

  if (yearsOnGitHub <= 2 && (totalStars > 20 || user.public_repos > 10)) {
    return {
      title: 'Rising Star',
      icon: 'fa-solid fa-rocket',
      badgeClass: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/40',
      description: 'High velocity builder quickly making an imprint in the developer community.'
    };
  }

  return {
    title: 'Code Crafter',
    icon: 'fa-solid fa-terminal',
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
    description: 'Relentless problem solver turning complex logic into clean, functional code.'
  };
}

function renderPersona(persona) {
  if (!els.personaBadge || !persona) return;
  els.personaBadge.className = `flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border shadow-sm ${persona.badgeClass}`;
  els.personaIcon.className = `${persona.icon} text-xs`;
  els.personaTitle.textContent = persona.title;
}

/* ── Hero Card ── */
function renderHero(user) {
  els.avatar.src = user.avatar_url || '';
  els.avatar.alt = `${user.login} avatar`;

  els.name.textContent  = user.name || user.login;
  els.login.textContent = `@${user.login}`;
  els.bio.textContent   = user.bio || 'No bio provided.';
  els.link.href         = user.html_url;

  // Save to history
  historyPush(user);

  // Populate the sticky header "Viewing" badge
  els.badgeAvatar.src           = user.avatar_url || '';
  els.badgeAvatar.alt           = `${user.login} avatar`;
  els.badgeUsername.textContent = `@${user.login}`;

  els.viewAllRepos.href = `${user.html_url}?tab=repositories`;


  // Meta badges
  const metaItems = [
    user.location && { icon: 'fa-location-dot',  text: user.location,        color: 'text-rose-400' },
    user.company  && { icon: 'fa-building',       text: user.company.replace(/^@/, ''), color: 'text-blue-400' },
    user.blog     && { icon: 'fa-link',           text: user.blog,            color: 'text-emerald-400', href: user.blog },
    user.twitter_username && { icon: 'fa-brands fa-twitter', text: `@${user.twitter_username}`, color: 'text-sky-400', href: `https://twitter.com/${user.twitter_username}` },
    user.created_at && { icon: 'fa-calendar',    text: `Joined ${formatDate(user.created_at)}`, color: 'text-slate-400' },
  ].filter(Boolean);

  els.meta.innerHTML = metaItems.map(item => {
    const inner = `<i class="fa-solid ${item.icon} ${item.color} text-xs"></i>
      <span class="text-xs text-slate-400">${escapeHTML(item.text)}</span>`;
    if (item.href) {
      const safeHref = item.href.startsWith('http') ? item.href : `https://${item.href}`;
      return `<a href="${escapeHTML(safeHref)}" target="_blank" rel="noopener noreferrer"
        class="flex items-center gap-1.5 bg-slate-800/60 border border-slate-700/60 rounded-full px-3 py-1 hover:border-indigo-500/40 transition-colors">${inner}</a>`;
    }
    return `<span class="flex items-center gap-1.5 bg-slate-800/60 border border-slate-700/60 rounded-full px-3 py-1">${inner}</span>`;
  }).join('');
}

/* ── KPI Stats Grid ── */
function renderStats(user) {
  const metrics = [
    { label: 'Repositories', value: user.public_repos,  icon: 'fa-book',          color: 'indigo',  grad: 'from-indigo-500/10 to-transparent' },
    { label: 'Followers',    value: user.followers,      icon: 'fa-user-group',    color: 'violet',  grad: 'from-violet-500/10 to-transparent' },
    { label: 'Following',    value: user.following,      icon: 'fa-heart',         color: 'rose',    grad: 'from-rose-500/10 to-transparent'   },
    { label: 'Public Gists', value: user.public_gists,  icon: 'fa-file-code',     color: 'emerald', grad: 'from-emerald-500/10 to-transparent' },
  ];

  els.statsGrid.innerHTML = metrics.map((m, i) => `
    <div class="kpi-card bg-slate-900 border border-slate-800 rounded-2xl p-5 relative overflow-hidden animate-slide-up"
         style="animation-delay: ${i * 0.06}s">
      <div class="absolute inset-0 bg-gradient-to-br ${m.grad} pointer-events-none"></div>
      <div class="relative">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">${m.label}</span>
          <div class="w-7 h-7 rounded-lg bg-${m.color}-500/10 border border-${m.color}-500/20 flex items-center justify-center">
            <i class="fa-solid ${m.icon} text-${m.color}-400 text-xs"></i>
          </div>
        </div>
        <div class="text-3xl font-bold text-white count-num" data-value="${m.value}">0</div>
        <div class="mt-1 text-xs text-slate-500">${m.value >= 1000 ? m.value.toLocaleString() + ' total' : 'total'}</div>
      </div>
    </div>
  `).join('');

  // Animate counts after DOM is ready
  requestAnimationFrame(() => {
    document.querySelectorAll('.count-num').forEach(el => {
      animateCount(el, parseInt(el.dataset.value, 10));
    });
  });
}

/* ── Repositories Grid ── */
function renderRepos(repos, username) {
  const display = repos
    .filter(r => !r.fork)          // prefer original repos
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 6);

  // If too few non-fork, fall back to all repos
  const finalRepos = display.length >= 2 ? display : repos.slice(0, 6);

  if (!finalRepos.length) {
    els.reposList.innerHTML = `
      <div class="col-span-2 text-center py-12 text-slate-500">
        <i class="fa-solid fa-inbox text-3xl mb-3 block"></i>
        No public repositories found.
      </div>`;
    return;
  }

  els.reposList.innerHTML = finalRepos.map((repo, i) => {
    const lang      = repo.language;
    const langColor = getLangColor(lang);
    const desc      = repo.description || 'No description provided.';

    return `
    <article class="repo-card bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 animate-slide-up"
             style="animation-delay:${i * 0.06 + 0.1}s">
      <div class="flex items-start justify-between gap-2">
        <div class="flex-1 min-w-0">
          <a href="${escapeHTML(repo.html_url)}" target="_blank" rel="noopener noreferrer"
             class="text-sm font-semibold text-indigo-300 hover:text-indigo-200 truncate block transition-colors"
             title="${escapeHTML(repo.name)}">
            <i class="fa-solid fa-book-open text-[10px] mr-1.5 text-indigo-500/70"></i>${escapeHTML(repo.name)}
          </a>
        </div>
        <span class="flex-shrink-0 text-[10px] font-medium border rounded-full px-2 py-0.5
          ${repo.private ? 'border-amber-500/30 text-amber-400 bg-amber-500/5' : 'border-slate-700 text-slate-500 bg-slate-800/50'}">
          ${repo.private ? 'private' : 'public'}
        </span>
      </div>

      <p class="text-xs text-slate-400 leading-relaxed line-clamp-2">${escapeHTML(desc)}</p>

      <div class="flex items-center justify-between mt-auto pt-1">
        <div class="flex items-center gap-1.5">
          ${lang ? `
            <span class="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span class="lang-dot inline-block" style="background:${langColor}"></span>
              ${escapeHTML(lang)}
            </span>` : '<span class="text-[11px] text-slate-600">—</span>'}
        </div>
        <div class="flex items-center gap-3 text-[11px] text-slate-400">
          <span class="flex items-center gap-1 hover:text-amber-300 transition-colors" title="Stars">
            <i class="fa-solid fa-star text-amber-400/70 text-[10px]"></i>
            ${formatNumber(repo.stargazers_count)}
          </span>
          <span class="flex items-center gap-1 hover:text-indigo-300 transition-colors" title="Forks">
            <i class="fa-solid fa-code-fork text-indigo-400/70 text-[10px]"></i>
            ${formatNumber(repo.forks_count)}
          </span>
        </div>
      </div>
    </article>
    `;
  }).join('');
}

/* ── Language Distribution ── */
function renderLanguages(repos) {
  const langMap = {};

  repos.forEach(repo => {
    if (repo.language) {
      langMap[repo.language] = (langMap[repo.language] || 0) + 1;
    }
  });

  const sorted = Object.entries(langMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (!sorted.length) {
    els.langChart.innerHTML = `<p class="text-xs text-slate-500 text-center py-4">No language data available.</p>`;
    return;
  }

  const total = sorted.reduce((sum, [, n]) => sum + n, 0);

  els.langChart.innerHTML = sorted.map(([lang, count], i) => {
    const pct   = Math.round((count / total) * 100);
    const color = getLangColor(lang);

    return `
    <div class="animate-slide-up" style="animation-delay:${i * 0.04 + 0.2}s">
      <div class="flex items-center justify-between mb-1">
        <div class="flex items-center gap-1.5">
          <span class="lang-dot inline-block" style="background:${color}"></span>
          <span class="text-xs text-slate-300 font-medium">${escapeHTML(lang)}</span>
        </div>
        <span class="text-xs text-slate-500 font-medium">${pct}%</span>
      </div>
      <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div class="h-full rounded-full progress-bar"
             style="--target-width:${pct}%; width:0%; background:${color}; animation-delay:${i * 0.06 + 0.3}s"></div>
      </div>
    </div>
    `;
  }).join('');
}

/* ── Developer Score ── */
function renderDevScore(user, repos) {
  // Score formula (max 100):
  // repos: up to 20pts  (log scale)
  // followers: up to 25pts
  // stars: up to 25pts
  // gists: up to 5pts
  // account age: up to 10pts
  // forks earned: up to 15pts

  const totalStars  = repos.reduce((s, r) => s + r.stargazers_count, 0);
  const totalForks  = repos.reduce((s, r) => s + r.forks_count, 0);
  const ageYears    = user.created_at
    ? (Date.now() - new Date(user.created_at)) / (1000 * 60 * 60 * 24 * 365.25)
    : 0;

  const repoScore     = Math.min(20, Math.log10(user.public_repos + 1) * 9);
  const followerScore = Math.min(25, Math.log10(user.followers + 1) * 10);
  const starScore     = Math.min(25, Math.log10(totalStars + 1) * 8);
  const gistScore     = Math.min(5,  Math.log10(user.public_gists + 1) * 2.5);
  const ageScore      = Math.min(10, ageYears * 1.5);
  const forkScore     = Math.min(15, Math.log10(totalForks + 1) * 6);

  const raw   = repoScore + followerScore + starScore + gistScore + ageScore + forkScore;
  const score = Math.min(100, Math.round(raw));

  const tiers = [
    { min: 90, label: '🏆 Legend',          bar: 'bg-gradient-to-r from-amber-400 to-yellow-300' },
    { min: 75, label: '🔥 Elite',            bar: 'bg-gradient-to-r from-orange-500 to-amber-400' },
    { min: 60, label: '⚡ Senior Dev',       bar: 'bg-gradient-to-r from-indigo-500 to-violet-400' },
    { min: 45, label: '💼 Mid-Level Dev',    bar: 'bg-gradient-to-r from-blue-500 to-indigo-400'  },
    { min: 28, label: '🌱 Junior Dev',       bar: 'bg-gradient-to-r from-emerald-500 to-teal-400' },
    { min: 0,  label: '👶 Beginner',         bar: 'bg-gradient-to-r from-slate-500 to-slate-400'  },
  ];

  const tier = tiers.find(t => score >= t.min) || tiers[tiers.length - 1];

  // Animate the score number
  setTimeout(() => {
    animateCount(els.devScore, score, 1000);
    els.devScoreLabel.textContent = tier.label;
    els.devScoreBar.className     = `h-full rounded-full progress-bar ${tier.bar}`;
    els.devScoreBar.style.cssText = `--target-width:${score}%; width:0%;`;
  }, 200);

  // Score breakdown
  const breakdown = [
    { label: 'Repositories', pts: Math.round(repoScore),     max: 20,  color: 'indigo' },
    { label: 'Followers',    pts: Math.round(followerScore),  max: 25,  color: 'violet' },
    { label: 'Total Stars',  pts: Math.round(starScore),      max: 25,  color: 'amber'  },
    { label: 'Account Age',  pts: Math.round(ageScore),       max: 10,  color: 'cyan'   },
    { label: 'Forks Earned', pts: Math.round(forkScore),      max: 15,  color: 'rose'   },
  ];

  els.scoreBreakdown.innerHTML = breakdown.map(b => `
    <div class="flex items-center justify-between text-xs">
      <span class="text-slate-400">${b.label}</span>
      <div class="flex items-center gap-2">
        <div class="w-16 h-1 bg-slate-800 rounded-full overflow-hidden">
          <div class="h-full bg-${b.color}-500 rounded-full progress-bar"
               style="--target-width:${(b.pts/b.max)*100}%; width:0%"></div>
        </div>
        <span class="text-slate-300 font-semibold w-8 text-right">${b.pts}<span class="text-slate-600 font-normal">/${b.max}</span></span>
      </div>
    </div>
  `).join('');

  return score;
}

/* ── Quick Facts ── */
function renderQuickFacts(user, repos) {
  const totalStars     = repos.reduce((s, r) => s + r.stargazers_count, 0);
  const mostStarred    = repos.sort((a, b) => b.stargazers_count - a.stargazers_count)[0];
  const mostForked     = [...repos].sort((a, b) => b.forks_count - a.forks_count)[0];
  const hasWebsite     = user.blog && user.blog.length > 0;
  const ageYears       = user.created_at
    ? Math.floor((Date.now() - new Date(user.created_at)) / (1000 * 60 * 60 * 24 * 365.25))
    : null;

  const facts = [
    { icon: 'fa-star',            color: 'text-amber-400',   label: 'Total Stars',     val: formatNumber(totalStars)                          },
    { icon: 'fa-code-branch',     color: 'text-indigo-400',  label: 'Top Repository',  val: mostStarred ? mostStarred.name : '—'              },
    { icon: 'fa-code-fork',       color: 'text-violet-400',  label: 'Most Forked',     val: mostForked ? mostForked.name : '—'                },
    { icon: 'fa-calendar-days',   color: 'text-cyan-400',    label: 'Account Age',     val: ageYears !== null ? `${ageYears} year${ageYears !== 1 ? 's' : ''}` : '—' },
    { icon: 'fa-globe',           color: 'text-emerald-400', label: 'Website',         val: hasWebsite ? 'Configured' : 'Not set'             },
    { icon: 'fa-envelope',        color: 'text-rose-400',    label: 'Email',           val: user.email || 'Private'                           },
  ].filter(Boolean);

  els.quickFacts.innerHTML = facts.map(f => `
    <div class="flex items-center justify-between py-1.5 border-b border-slate-800/60 last:border-0">
      <div class="flex items-center gap-2 text-xs text-slate-400">
        <i class="fa-solid ${f.icon} ${f.color} w-3.5 text-center text-[11px]"></i>
        <span>${f.label}</span>
      </div>
      <span class="text-xs font-semibold text-slate-300 truncate max-w-[110px] text-right" title="${escapeHTML(String(f.val))}">${escapeHTML(String(f.val))}</span>
    </div>
  `).join('');
}

/* ──────────────────────────────────────────────
   EVENT LISTENERS
────────────────────────────────────────────── */
els.searchBtn.addEventListener('click', () => {
  closeHistoryDropdown();
  handleSearch();
});

els.input.addEventListener('keydown', e => {
  if (e.key === 'Enter') { closeHistoryDropdown(); handleSearch(); }
  if (e.key === 'Escape') closeHistoryDropdown();
});

// Show history dropdown on focus
els.input.addEventListener('focus', () => {
  renderHistoryDropdown(els.input.value.trim());
});

// Live suggestions as user types
els.input.addEventListener('input', e => {
  const val = e.target.value.trim();
  renderHistoryDropdown(val);

  clearTimeout(liveSearchDebounceTimer);
  if (val.length >= 2) {
    liveSearchDebounceTimer = setTimeout(() => {
      handleLiveSuggestions(val);
    }, 350);
  } else {
    const liveSec = $('liveSuggestionsSection');
    if (liveSec) liveSec.classList.add('hidden');
  }
});

// Close dropdown when clicking outside
document.addEventListener('click', e => {
  const dropdown = $('historyDropdown');
  if (dropdown && !dropdown.contains(e.target) && e.target !== els.input) {
    closeHistoryDropdown();
  }
});

function closeHistoryDropdown() {
  const d = $('historyDropdown');
  if (d) d.classList.add('hidden');
}

// History dropdown — click row to search, click X to remove
document.addEventListener('click', e => {
  // Remove single item
  if (e.target.closest('.remove-history-item')) {
    e.stopPropagation();
    const login = e.target.closest('.remove-history-item').dataset.login;
    historyRemove(login);
    renderHistoryDropdown();
    renderWelcomeHistory();
    return;
  }
  // Click row → search
  const row = e.target.closest('[data-login]');
  if (row && $('historyDropdown') && !$('historyDropdown').classList.contains('hidden')) {
    const login = row.dataset.login;
    if (login) {
      els.input.value = login;
      closeHistoryDropdown();
      fetchProfile(login);
    }
  }
});

// Clear all (dropdown header button)
$('clearHistoryBtn').addEventListener('click', e => {
  e.stopPropagation();
  historyClear();
  closeHistoryDropdown();
  renderWelcomeHistory();
});

// Clear all (welcome screen button)
$('clearWelcomeHistoryBtn').addEventListener('click', e => {
  e.stopPropagation();
  historyClear();
  renderWelcomeHistory();
});

// Welcome screen chips → click to re-search
document.addEventListener('click', e => {
  const chip = e.target.closest('.welcome-history-chip');
  if (chip) {
    const login = chip.dataset.login;
    if (login) {
      els.input.value = login;
      fetchProfile(login);
    }
  }
});

els.retryBtn.addEventListener('click', () => {
  showState('welcome');
  renderWelcomeHistory();
  els.input.value = '';
  els.input.focus();
});

// Error suggestions card click listener
document.addEventListener('click', e => {
  const chip = e.target.closest('.error-suggestion-chip');
  if (chip) {
    const login = chip.dataset.login;
    if (login) {
      els.input.value = login;
      closeHistoryDropdown();
      fetchProfile(login);
    }
  }
});

// Brand logo resets to welcome state
document.getElementById('brandLogo').addEventListener('click', e => {
  e.preventDefault();
  showState('welcome');
  renderWelcomeHistory();
  els.input.value = '';
});

/* ──────────────────────────────────────────────
   DEVELOPER CARD MODAL & EXPORT ENGINE
────────────────────────────────────────────── */
async function getBase64Image(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const blob = await res.blob();
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

async function openDevCardModal() {
  if (!currentProfile) return;
  const { user, repos, devScore, persona } = currentProfile;

  const cardAvatar = $('cardAvatar');
  if (cardAvatar) {
    cardAvatar.src = els.avatar.src || user.avatar_url || '';
  }

  $('cardName').textContent = user.name || user.login;
  $('cardLogin').textContent = `@${user.login}`;

  const cardBadge = $('cardPersonaBadge');
  const cardIcon  = $('cardPersonaIcon');
  const cardTitle = $('cardPersonaTitle');
  const cardDesc  = $('cardPersonaDesc');

  if (cardBadge && persona) {
    cardBadge.className = `inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border shadow-sm mb-2 ${persona.badgeClass}`;
    cardIcon.className = `${persona.icon} text-[10px]`;
    cardTitle.textContent = persona.title;
    cardDesc.textContent = persona.description;
  }

  const totalStars = repos.reduce((s, r) => s + (r.stargazers_count || 0), 0);
  $('cardDevScore').textContent = `${devScore}/100`;
  $('cardStars').textContent = formatNumber(totalStars);
  $('cardRepos').textContent = formatNumber(user.public_repos);
  $('cardFollowers').textContent = formatNumber(user.followers);

  const langMap = {};
  repos.forEach(r => {
    if (r.language) langMap[r.language] = (langMap[r.language] || 0) + 1;
  });
  const topLangs = Object.entries(langMap).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const cardTopLangs = $('cardTopLangs');
  if (cardTopLangs) {
    if (topLangs.length > 0) {
      cardTopLangs.innerHTML = topLangs.map(([lang]) => `
        <span class="flex items-center gap-1 bg-slate-800/80 border border-slate-700/60 rounded-full px-2 py-0.5 text-[10px] text-slate-300">
          <span class="w-1.5 h-1.5 rounded-full" style="background:${getLangColor(lang)}"></span>
          ${escapeHTML(lang)}
        </span>
      `).join('');
    } else {
      cardTopLangs.innerHTML = `<span class="text-[10px] text-slate-600">Polyglot</span>`;
    }
  }

  els.devCardModal.classList.remove('hidden');
}

function closeDevCardModal() {
  if (els.devCardModal) els.devCardModal.classList.add('hidden');
}

async function exportCardAsPNG() {
  const card = $('devCardCaptureArea');
  const btn = $('downloadCardBtn');
  if (!card || !btn) return;
  const original = btn.innerHTML;

  try {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin"></i> Generating…`;

    if (window.html2canvas) {
      const canvas = await window.html2canvas(card, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#090d16',
        logging: false,
      });

      const link = document.createElement('a');
      link.download = `gitpulse-${currentProfile?.user?.login || 'developer'}-card.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } else {
      alert('Export engine loading, please try again in a moment.');
    }
  } catch (err) {
    console.error('Failed to export card image', err);
    alert('Failed to generate image. Please try again.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

async function copyCardImage() {
  const card = $('devCardCaptureArea');
  const textSpan = $('copyCardBtnText');
  if (!card) return;

  try {
    if (textSpan) textSpan.textContent = 'Copying…';

    if (window.html2canvas && navigator.clipboard && window.ClipboardItem) {
      const canvas = await window.html2canvas(card, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#090d16',
        logging: false,
      });

      canvas.toBlob(async blob => {
        if (!blob) throw new Error('Blob creation failed');
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        if (textSpan) textSpan.textContent = 'Copied!';
        setTimeout(() => { if (textSpan) textSpan.textContent = 'Copy Image'; }, 2000);
      });
    } else {
      throw new Error('ClipboardItem unsupported');
    }
  } catch (err) {
    console.warn('Copy image fallback', err);
    if (textSpan) textSpan.textContent = 'Use Download';
    setTimeout(() => { if (textSpan) textSpan.textContent = 'Copy Image'; }, 2000);
  }
}

function shareProfileLink() {
  const textSpan = $('shareLinkBtnText');
  const user = currentProfile?.user?.login || els.input.value.trim();
  const url = `${window.location.origin}${window.location.pathname}?user=${encodeURIComponent(user)}`;

  navigator.clipboard.writeText(url).then(() => {
    if (textSpan) textSpan.textContent = 'Copied Link!';
    setTimeout(() => { if (textSpan) textSpan.textContent = 'Share Link'; }, 2000);
  }).catch(() => {
    prompt('Copy this profile link:', url);
  });
}

// Dev Card event listeners
if (els.exportCardBtn) els.exportCardBtn.addEventListener('click', openDevCardModal);
if (els.closeDevCardModal) els.closeDevCardModal.addEventListener('click', closeDevCardModal);
if (els.downloadCardBtn) els.downloadCardBtn.addEventListener('click', exportCardAsPNG);
if (els.downloadPdfBtn) els.downloadPdfBtn.addEventListener('click', exportCardAsPDF);
if (els.exportPdfReportBtn) els.exportPdfReportBtn.addEventListener('click', exportProfileReportAsPDF);
if (els.copyCardBtn) els.copyCardBtn.addEventListener('click', copyCardImage);
if (els.shareLinkBtn) els.shareLinkBtn.addEventListener('click', shareProfileLink);

/* ── PDF Export Engines ── */
async function exportCardAsPDF() {
  const card = $('devCardCaptureArea');
  const btn = $('downloadPdfBtn');
  if (!card || !btn) return;
  const original = btn.innerHTML;

  try {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin"></i> Rendering PDF…`;

    if (!window.html2canvas) {
      alert('Capture library is still loading, please try again in a moment.');
      return;
    }

    const canvas = await window.html2canvas(card, {
      scale: 2.5,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#090d16',
      logging: false,
    });

    const imgData = canvas.toDataURL('image/png');
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;

    const jsPDF = window.jspdf ? window.jspdf.jsPDF : window.jsPDF;

    if (jsPDF) {
      const pdf = new jsPDF({
        orientation: imgWidth >= imgHeight ? 'landscape' : 'portrait',
        unit: 'px',
        format: [imgWidth * 0.5, imgHeight * 0.5]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth * 0.5, imgHeight * 0.5);
      const filename = `gitpulse-${currentProfile?.user?.login || 'developer'}-card.pdf`;
      pdf.save(filename);
    } else {
      const win = window.open('', '_blank');
      win.document.write(`
        <!DOCTYPE html>
        <html>
          <head><title>GitPulse - ${currentProfile?.user?.login || 'Developer'} Card</title></head>
          <body style="margin:0;display:flex;align-items:center;justify-content:center;background:#090d16;height:100vh;">
            <img src="${imgData}" style="max-width:95%;border-radius:16px;" />
            <script>window.onload = function() { window.print(); }<\/script>
          </body>
        </html>
      `);
      win.document.close();
    }
  } catch (err) {
    console.error('Failed to export card PDF', err);
    alert('Failed to generate PDF. Please try again.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

async function exportProfileReportAsPDF() {
  const container = $('profileContainer');
  const btn = $('exportPdfReportBtn');
  if (!container || !btn) return;
  const original = btn.innerHTML;

  try {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-circle-notch animate-spin text-rose-400"></i> Generating PDF…`;

    if (!window.html2canvas) {
      alert('Capture library is still loading, please try again in a moment.');
      return;
    }

    const canvas = await window.html2canvas(container, {
      scale: 1.8,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#020617',
      logging: false,
    });

    const imgData = canvas.toDataURL('image/png');
    const jsPDF = window.jspdf ? window.jspdf.jsPDF : window.jsPDF;

    if (jsPDF) {
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4'
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth - 40;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 20;

      pdf.addImage(imgData, 'PNG', 20, position, imgWidth, imgHeight);
      heightLeft -= (pageHeight - 40);

      while (heightLeft > 0) {
        position = heightLeft - imgHeight + 20;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 20, position, imgWidth, imgHeight);
        heightLeft -= (pageHeight - 40);
      }

      const filename = `gitpulse-${currentProfile?.user?.login || 'developer'}-report.pdf`;
      pdf.save(filename);
    } else {
      window.print();
    }
  } catch (err) {
    console.error('Failed to export profile report PDF', err);
    alert('Failed to export PDF report. Please try again.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

// Close modal on backdrop click or Escape
if (els.devCardModal) {
  els.devCardModal.addEventListener('click', e => {
    if (e.target === els.devCardModal) closeDevCardModal();
  });
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && els.devCardModal && !els.devCardModal.classList.contains('hidden')) {
    closeDevCardModal();
  }
});

/* ──────────────────────────────────────────────
   INIT
────────────────────────────────────────────── */
(function init() {
  showState('welcome');
  renderWelcomeHistory();
  // Auto-focus the input for immediate UX
  setTimeout(() => els.input.focus(), 300);

  // Allow URL param: ?user=torvalds
  const params = new URLSearchParams(window.location.search);
  const userParam = params.get('user') || params.get('username');
  if (userParam) {
    els.input.value = userParam;
    fetchProfile(userParam);
  }
})();
