<script>
  import { onDestroy, onMount } from 'svelte';

  let overview = null;
  let locations = [];
  let scans = [];
  let dupes = [];
  let results = [];
  let scanProgress = {};
  let treeEntries = [];
  let selectedLocationSlug = null;
  let selectedScanId = null;
  let selectedPath = '';
  let query = '';
  let duplicateFilter = '';
  let activeTab = 'locations';
  let confirmDeleteScanId = null;
  let form = {
    kind: 'local',
    name: '',
    slug: '',
    root_path: '',
    notes: ''
  };
  let busy = false;
  let message = '';
  let poller = null;

  const tabs = [
    ['locations', 'Locations'],
    ['duplicates', 'Duplicates'],
    ['search', 'Search']
  ];

  onMount(async () => {
    parseRoute();
    window.addEventListener('popstate', handlePopstate);
    await refresh();
    poller = setInterval(pollRunningScans, 1000);
  });

  onDestroy(() => {
    if (poller) clearInterval(poller);
    window.removeEventListener('popstate', handlePopstate);
  });

  function handlePopstate() {
    parseRoute();
    ensureSelection();
    loadTree();
  }

  function parseRoute() {
    const url = new URL(window.location.href);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'duplicates') {
      activeTab = 'duplicates';
      duplicateFilter = url.searchParams.get('filter') || '';
      return;
    }
    if (parts[0] === 'search') {
      activeTab = 'search';
      query = url.searchParams.get('q') || '';
      return;
    }
    activeTab = 'locations';
    if (parts[0] === 'locations' && parts[1]) {
      selectedLocationSlug = decodeURIComponent(parts[1]);
    }
    if (parts[2] === 'scans' && parts[3]) {
      selectedScanId = decodeURIComponent(parts[3]);
    }
    selectedPath = url.searchParams.get('path') || '';
  }

  function routeTo(replace = false) {
    const params = new URLSearchParams();
    let path = '/locations';
    if (activeTab === 'duplicates') {
      path = '/duplicates';
      if (duplicateFilter.trim()) params.set('filter', duplicateFilter.trim());
    } else if (activeTab === 'search') {
      path = '/search';
      if (query.trim()) params.set('q', query.trim());
    } else if (selectedLocationSlug) {
      path = `/locations/${encodeURIComponent(selectedLocationSlug)}`;
      if (selectedScanId) {
        path += `/scans/${encodeURIComponent(selectedScanId)}`;
        if (selectedPath) params.set('path', selectedPath);
      }
    }
    const next = `${path}${params.toString() ? `?${params}` : ''}`;
    if (next === `${window.location.pathname}${window.location.search}`) return;
    window.history[replace ? 'replaceState' : 'pushState']({}, '', next);
  }

  function setTab(tab) {
    activeTab = tab;
    routeTo();
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      headers: { 'content-type': 'application/json' },
      ...options
    });
    if (response.status === 204) return null;
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Request failed');
    return body;
  }

  async function refresh() {
    busy = true;
    message = '';
    try {
      let running;
      [overview, locations, scans, dupes, running] = await Promise.all([
        api('/api/overview'),
        api('/api/locations'),
        api('/api/scans'),
        api('/api/dupes?limit=100'),
        api('/api/scans/running')
      ]);
      mergeProgress(running);
      ensureSelection();
      routeTo(true);
      await loadTree();
    } catch (error) {
      message = error.message;
    } finally {
      busy = false;
    }
  }

  function ensureSelection() {
    if (!selectedLocationSlug && locations.length) {
      selectedLocationSlug = locations[0].slug;
    }
    const location = selectedLocation();
    if (!location) {
      selectedLocationSlug = locations[0]?.slug || null;
      selectedScanId = null;
      selectedPath = '';
      return;
    }

    const view = locationView(location);
    if (selectedScanId && view.scans.some((scan) => scan.id === selectedScanId)) return;
    selectedScanId = view.bestScan?.id || view.scans[0]?.id || null;
    selectedPath = '';
  }

  async function addLocation() {
    busy = true;
    try {
      await api('/api/locations', {
        method: 'POST',
        body: JSON.stringify({
          kind: form.kind,
          name: form.name,
          slug: form.slug,
          root_path: form.root_path,
          notes: form.notes || null
        })
      });
      selectedLocationSlug = form.slug;
      form = { kind: 'local', name: '', slug: '', root_path: '', notes: '' };
      await refresh();
    } catch (error) {
      message = error.message;
    } finally {
      busy = false;
    }
  }

  async function startScan(slug) {
    busy = true;
    try {
      const result = await api(`/api/locations/${slug}/scan`, {
        method: 'POST',
        body: JSON.stringify({ offset: '/' })
      });
      activeTab = 'locations';
      selectedLocationSlug = slug;
      selectedScanId = result.scan_id;
      selectedPath = '';
      routeTo();
      scanProgress = {
        ...scanProgress,
        [result.scan_id]: {
          scan_id: result.scan_id,
          location_slug: slug,
          location_name: locationBySlug(slug)?.name || slug,
          status: 'running',
          file_count: 0,
          dir_count: 0,
          error_count: 0,
          total_bytes: 0,
          current_path: null,
          log: ['Scan queued']
        }
      };
      scans = [
        {
          id: result.scan_id,
          location_slug: slug,
          location_name: locationBySlug(slug)?.name || slug,
          status: 'running',
          file_count: 0,
          dir_count: 0,
          error_count: 0,
          total_bytes: 0,
          offset_path: '/',
          started_at: new Date().toISOString(),
          finished_at: null
        },
        ...scans
      ];
      message = `Scan started for ${slug}.`;
      await pollRunningScans();
      await loadTree();
    } catch (error) {
      message = error.message;
    } finally {
      busy = false;
    }
  }

  async function pollRunningScans() {
    const runningIds = Object.values(scanProgress)
      .filter((progress) => isActiveStatus(progress.status))
      .map((progress) => progress.scan_id);
    if (runningIds.length === 0) return;

    try {
      const updates = await Promise.all(
        runningIds.map((scanId) => api(`/api/scans/${scanId}/progress`).catch(() => null))
      );
      mergeProgress(updates.filter(Boolean));
      if (selectedScanId && runningIds.includes(selectedScanId)) {
        await loadTree();
      }
      if (updates.some((progress) => progress && !isActiveStatus(progress.status))) {
        await refresh();
      }
    } catch (error) {
      message = error.message;
    }
  }

  function mergeProgress(items) {
    const next = { ...scanProgress };
    for (const item of items || []) {
      next[item.scan_id] = item;
    }
    scanProgress = next;
  }

  function locationBySlug(slug) {
    return locations.find((location) => location.slug === slug);
  }

  function selectedLocation() {
    return locationBySlug(selectedLocationSlug);
  }

  function progressFor(scanId) {
    return scanProgress[scanId];
  }

  function scanView(scan) {
    const live = progressFor(scan.id);
    return {
      ...scan,
      ...(live || {}),
      status: live?.status || scan.status,
      file_count: live?.file_count ?? scan.file_count,
      dir_count: live?.dir_count ?? scan.dir_count,
      error_count: live?.error_count ?? scan.error_count,
      total_bytes: live?.total_bytes ?? scan.total_bytes,
      current_path: live?.current_path || null,
      log: live?.log || []
    };
  }

  function scansForLocation(slug) {
    return scans.filter((scan) => scan.location_slug === slug).map(scanView);
  }

  function locationView(location) {
    const locationScans = scansForLocation(location.slug);
    const active = locationScans.find((scan) => isActiveStatus(scan.status));
    const successful = locationScans.find((scan) => scan.status === 'complete');
    return {
      ...location,
      scans: locationScans,
      scanCount: locationScans.length,
      activeScan: active || null,
      bestScan: active || successful || locationScans[0] || null,
      lastSuccessfulScan: successful || null
    };
  }

  function locationViews() {
    return locations.map(locationView).sort((a, b) => a.slug.localeCompare(b.slug));
  }

  function selectedScan() {
    const scan = scans.find((item) => item.id === selectedScanId);
    return scan ? scanView(scan) : null;
  }

  function runningProgress() {
    return Object.values(scanProgress).filter((progress) => isActiveStatus(progress.status));
  }

  function isActiveStatus(status) {
    return status === 'running' || status === 'stopping';
  }

  function chooseLocation(slug) {
    selectedLocationSlug = slug;
    const view = locationView(locationBySlug(slug));
    selectedScanId = view.bestScan?.id || null;
    selectedPath = '';
    activeTab = 'locations';
    routeTo();
    loadTree();
  }

  async function selectScan(scanId) {
    selectedScanId = scanId;
    selectedPath = '';
    activeTab = 'locations';
    routeTo();
    await loadTree();
  }

  async function loadTree(path = selectedPath) {
    if (!selectedScanId) {
      treeEntries = [];
      return;
    }
    selectedPath = path || '';
    routeTo(true);
    treeEntries = await api(`/api/scans/${selectedScanId}/tree?path=${encodeURIComponent(selectedPath)}`);
  }

  function breadcrumbs() {
    if (!selectedPath) return [{ label: 'root', path: '' }];
    const parts = selectedPath.split('/').filter(Boolean);
    const crumbs = [{ label: 'root', path: '' }];
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      crumbs.push({ label: part, path: current });
    }
    return crumbs;
  }

  async function stopScan(scanId) {
    busy = true;
    try {
      await api(`/api/scans/${scanId}/stop`, { method: 'POST', body: '{}' });
      await pollRunningScans();
    } catch (error) {
      message = error.message;
    } finally {
      busy = false;
    }
  }

  function requestDelete(scanId) {
    confirmDeleteScanId = scanId;
  }

  async function deleteScan(scanId) {
    busy = true;
    try {
      await api(`/api/scans/${scanId}`, { method: 'DELETE' });
      scans = scans.filter((scan) => scan.id !== scanId);
      const nextProgress = { ...scanProgress };
      delete nextProgress[scanId];
      scanProgress = nextProgress;
      confirmDeleteScanId = null;
      if (selectedScanId === scanId) {
        const view = selectedLocation() ? locationView(selectedLocation()) : null;
        selectedScanId = view?.bestScan?.id || view?.scans[0]?.id || null;
        selectedPath = '';
        treeEntries = [];
      }
      routeTo(true);
      await refresh();
      message = 'Scan deleted.';
    } catch (error) {
      message = error.message;
    } finally {
      busy = false;
    }
  }

  async function search() {
    if (!query.trim()) {
      results = [];
      return;
    }
    busy = true;
    try {
      activeTab = 'search';
      routeTo();
      results = await api(`/api/find?q=${encodeURIComponent(query)}&limit=200`);
    } catch (error) {
      message = error.message;
    } finally {
      busy = false;
    }
  }

  function filteredDupes() {
    const needle = duplicateFilter.trim().toLowerCase();
    if (!needle) return dupes;
    return dupes.filter((group) =>
      group.files.some((file) =>
        `${file.location_slug} ${file.location_name} ${file.path}`.toLowerCase().includes(needle)
      )
    );
  }

  function updateDuplicateFilter(value) {
    duplicateFilter = value;
    activeTab = 'duplicates';
    routeTo(true);
  }

  function statusLabel(status) {
    if (status === 'complete') return 'Ready';
    if (status === 'running') return 'Scanning';
    if (status === 'stopping') return 'Stopping';
    if (status === 'stopped') return 'Stopped';
    if (status === 'failed') return 'Failed';
    return status || 'Unknown';
  }

  function when(value) {
    return value ? new Date(value).toLocaleString() : 'never';
  }

  function bytes(value) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = Number(value || 0);
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
  }
</script>

<main>
  <header>
    <div>
      <h1>file-census</h1>
      <p>Inventory locations, browse scanned trees, and find real cross-snapshot duplicates.</p>
    </div>
    <button on:click={refresh} disabled={busy}>Refresh</button>
  </header>

  {#if overview}
    <section class="metrics">
      <div><strong>{overview.location_count}</strong><span>Locations</span></div>
      <div><strong>{overview.scan_count}</strong><span>Scans</span></div>
      <div><strong>{overview.file_count}</strong><span>Files</span></div>
      <div><strong>{bytes(overview.total_bytes)}</strong><span>Indexed</span></div>
      <div><strong>{overview.duplicate_groups}</strong><span>Dupe groups</span></div>
    </section>
  {/if}

  {#if message}
    <p class="message">{message}</p>
  {/if}

  {#if runningProgress().length}
    <section class="progress-band">
      {#each runningProgress() as progress}
        <article class="progress-card">
          <div>
            <strong>{progress.location_slug} <span>{progress.location_name}</span></strong>
            <span>{progress.file_count} files · {bytes(progress.total_bytes)} · {progress.error_count} errors</span>
            {#if progress.current_path}
              <code>{progress.current_path}</code>
            {/if}
          </div>
          <span class="status-pill">{statusLabel(progress.status)}</span>
        </article>
      {/each}
    </section>
  {/if}

  <nav>
    {#each tabs as tab}
      <button class:active={activeTab === tab[0]} on:click={() => setTab(tab[0])}>
        {tab[1]}
      </button>
    {/each}
  </nav>

  {#if activeTab === 'locations'}
    <section class="workspace">
      <aside class="locations-panel">
        <form class="add-location" on:submit|preventDefault={addLocation}>
          <h2>Add location</h2>
          <label>Type<select bind:value={form.kind}><option value="local">Local</option><option value="disk">Disk</option><option value="nas">NAS</option></select></label>
          <label>Name<input bind:value={form.name} required /></label>
          <label>Slug<input bind:value={form.slug} required /></label>
          <label>Root path<input bind:value={form.root_path} required placeholder="/Volumes/Archive" /></label>
          <button disabled={busy}>Add</button>
        </form>

        <section>
          <h2>Locations</h2>
          <div class="location-list">
            {#each locationViews() as location}
              <button type="button" class:selected={selectedLocationSlug === location.slug} class="location-card" on:click={() => chooseLocation(location.slug)}>
                <strong>{location.slug}</strong>
                <span>{location.name}</span>
                <code>{location.root_path}</code>
                <div class="location-stats">
                  <span>{location.scanCount} scans</span>
                  <span>{location.activeScan ? statusLabel(location.activeScan.status) : 'idle'}</span>
                </div>
                <small>Last good: {when(location.lastSuccessfulScan?.finished_at)}</small>
              </button>
            {:else}
              <p class="empty">No locations yet.</p>
            {/each}
          </div>
        </section>
      </aside>

      <section class="main-panel">
        {#if selectedLocation()}
          {@const location = locationView(selectedLocation())}
          {@const activeScan = selectedScan()}
          <div class="location-header">
            <div>
              <h2>{location.slug} <span>{location.name}</span></h2>
              <code>{location.root_path}</code>
            </div>
            <button on:click={() => startScan(location.slug)} disabled={busy}>Scan now</button>
          </div>

          <section class="summary-grid">
            <div><strong>{location.scanCount}</strong><span>Total scans</span></div>
            <div><strong>{location.activeScan ? statusLabel(location.activeScan.status) : 'Idle'}</strong><span>Current state</span></div>
            <div><strong>{location.lastSuccessfulScan ? bytes(location.lastSuccessfulScan.total_bytes) : '0 B'}</strong><span>Last indexed size</span></div>
            <div><strong>{when(location.lastSuccessfulScan?.finished_at)}</strong><span>Last successful scan</span></div>
          </section>

          <section class="scan-tools">
            <div class="scan-history">
              <h3>Scan history</h3>
              <div class="scan-list">
                {#each location.scans as item}
                  <button type="button" class:selected={selectedScanId === item.id} on:click={() => selectScan(item.id)}>
                    <strong>{statusLabel(item.status)} · {item.file_count} files</strong>
                    <span>{when(item.started_at)} · {bytes(item.total_bytes)}</span>
                  </button>
                {:else}
                  <p class="empty">Run a scan to begin exploring this location.</p>
                {/each}
              </div>
            </div>

            <div class="explorer">
              <div class="explorer-header">
                <h3>File tree</h3>
                {#if activeScan}
                  <span>{statusLabel(activeScan.status)} · {activeScan.file_count} files · {bytes(activeScan.total_bytes)}</span>
                {/if}
              </div>

              {#if activeScan}
                <div class="detail-actions">
                  {#if isActiveStatus(activeScan.status)}
                    <button on:click={() => stopScan(activeScan.id)} disabled={busy}>Stop</button>
                  {/if}
                  {#if confirmDeleteScanId === activeScan.id}
                    <button class="danger" on:click={() => deleteScan(activeScan.id)} disabled={busy}>Confirm delete</button>
                    <button class="secondary" on:click={() => (confirmDeleteScanId = null)} disabled={busy}>Cancel</button>
                  {:else}
                    <button class="secondary" on:click={() => requestDelete(activeScan.id)} disabled={busy}>Delete scan</button>
                  {/if}
                </div>

                <div class="breadcrumbs">
                  {#each breadcrumbs() as crumb}
                    <button type="button" on:click={() => loadTree(crumb.path)}>{crumb.label}</button>
                  {/each}
                </div>

                <div class="tree">
                  {#each treeEntries as entry}
                    {#if entry.kind === 'dir'}
                      <button type="button" class="tree-row" on:click={() => loadTree(entry.path)}>
                        <strong>{entry.name}/</strong>
                        <span>{entry.file_count} files · {bytes(entry.size)}</span>
                      </button>
                    {:else}
                      <div class="tree-row file">
                        <strong>{entry.name}</strong>
                        <span>{bytes(entry.size)}</span>
                      </div>
                    {/if}
                  {:else}
                    <p class="empty">No files discovered at this path yet.</p>
                  {/each}
                </div>

                <section class="log">
                  <h3>Work log</h3>
                  {#each (activeScan.log || []).slice().reverse() as line}
                    <code>{line}</code>
                  {:else}
                    <span>No live log for this scan.</span>
                  {/each}
                </section>
              {:else}
                <p class="empty">Select or run a scan to browse this location.</p>
              {/if}
            </div>
          </section>
        {:else}
          <p class="empty">Add a location to start building the census.</p>
        {/if}
      </section>
    </section>
  {/if}

  {#if activeTab === 'duplicates'}
    <section class="tool-page">
      <div class="tool-header">
        <div>
          <h2>Cross-scan duplicates</h2>
          <p>Only content appearing in more than one scan is shown.</p>
        </div>
        <input value={duplicateFilter} on:input={(event) => updateDuplicateFilter(event.currentTarget.value)} placeholder="Filter by location or path" />
      </div>
      <div class="dupe-grid">
        {#each filteredDupes() as group}
          <article class="stack dupe-card">
            <strong>{group.count} scans · {bytes(group.size)}</strong>
            <code>{group.blake3}</code>
            {#each group.files as file}
              <button type="button" class="dupe-file" on:click={() => { activeTab = 'locations'; selectedLocationSlug = file.location_slug; selectScan(file.scan_id); }}>
                <span>{file.location_slug} · {file.location_name}</span>
                <code>{file.path}</code>
              </button>
            {/each}
          </article>
        {:else}
          <p class="empty">No cross-scan duplicates match.</p>
        {/each}
      </div>
    </section>
  {/if}

  {#if activeTab === 'search'}
    <section class="tool-page">
      <div class="tool-header">
        <div>
          <h2>Find files</h2>
          <p>Search filenames and indexed paths across all scans.</p>
        </div>
      </div>
      <form class="search" on:submit|preventDefault={search}>
        <input bind:value={query} placeholder="filename or path" />
        <button disabled={busy}>Search</button>
      </form>
      <div class="table">
        {#each results as file}
          <button type="button" class="result-row" on:click={() => { activeTab = 'locations'; selectedLocationSlug = file.location_slug; selectScan(file.scan_id); }}>
            <strong>{file.name}</strong>
            <span>{file.location_slug} · {file.location_name} · {bytes(file.size)}</span>
            <code>{file.path}</code>
          </button>
        {:else}
          <p class="empty">Search by filename, extension, or path fragment.</p>
        {/each}
      </div>
    </section>
  {/if}
</main>
