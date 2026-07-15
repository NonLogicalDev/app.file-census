export function isTauriRuntime() {
  const protocol = window.location?.protocol;
  return Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__ || protocol === 'tauri:');
}

export async function databaseInfo() {
  if (!isTauriRuntime()) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('database_info');
}

export async function chooseDatabase() {
  if (!isTauriRuntime()) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('database_choose');
}

export async function chooseFolder(currentPath = '') {
  if (!isTauriRuntime()) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke('folder_choose', { currentPath });
}
