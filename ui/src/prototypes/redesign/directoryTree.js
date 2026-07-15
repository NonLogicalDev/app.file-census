export const DIRECTORY_ROOT_PATH = ''

export function normalizeDirectoryPath(path) {
  return String(path || '')
    .split('/')
    .filter(Boolean)
    .join('/')
}

export function directoryPathAncestors(path, { includeRoot = true, includeSelf = true } = {}) {
  const parts = normalizeDirectoryPath(path).split('/').filter(Boolean)
  const result = includeRoot ? [DIRECTORY_ROOT_PATH] : []
  const end = includeSelf ? parts.length : Math.max(parts.length - 1, 0)

  for (let index = 1; index <= end; index += 1) {
    result.push(parts.slice(0, index).join('/'))
  }

  return result
}

export function fileParentDirectoryPath(path) {
  const parts = normalizeDirectoryPath(path).split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

/**
 * The side-pane model is intentionally directory-only.  File values only
 * contribute ancestry and counts here; they never become navigation nodes.
 */
export function buildDirectoryNavigationTree(files = []) {
  const root = createDirectoryNode(DIRECTORY_ROOT_PATH, 'Scan root')
  const nodesByPath = new Map([[DIRECTORY_ROOT_PATH, root]])

  for (const file of files) {
    const segments = normalizeDirectoryPath(file?.path).split('/').filter(Boolean)
    if (!segments.length) continue

    root.fileCount += 1
    let parent = root
    let directoryPath = ''

    for (const segment of segments.slice(0, -1)) {
      directoryPath = directoryPath ? `${directoryPath}/${segment}` : segment
      let node = nodesByPath.get(directoryPath)
      if (!node) {
        node = createDirectoryNode(directoryPath, segment)
        nodesByPath.set(directoryPath, node)
        parent.children.push(node)
      }
      node.fileCount += 1
      parent = node
    }
  }

  return sortDirectoryTree(root)
}

export function filesInDirectory(files = [], directoryPath = DIRECTORY_ROOT_PATH) {
  const normalizedDirectoryPath = normalizeDirectoryPath(directoryPath)
  if (!normalizedDirectoryPath) return [...files]
  const prefix = `${normalizedDirectoryPath}/`
  return files.filter((file) => normalizeDirectoryPath(file?.path).startsWith(prefix))
}

/**
 * Main-workspace File tree rows deliberately contain both folders and files.
 * This is the only prototype tree projection that emits file leaves.
 */
export function buildWorkspaceFileTreeRows(tree, files = [], expandedPaths = []) {
  const expanded = new Set([...expandedPaths].map(normalizeDirectoryPath))
  const filesByParent = new Map()

  for (const file of files) {
    const parent = fileParentDirectoryPath(file?.path)
    const current = filesByParent.get(parent) || []
    current.push(file)
    filesByParent.set(parent, current)
  }

  for (const fileRows of filesByParent.values()) {
    fileRows.sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')))
  }

  const rows = []
  const visit = (node, depth) => {
    const childDirectories = node.children || []
    const childFiles = filesByParent.get(node.path) || []
    const expandable = childDirectories.length > 0 || childFiles.length > 0
    rows.push({
      kind: 'dir',
      node,
      depth,
      expandable,
      expanded: expanded.has(node.path)
    })
    if (!expanded.has(node.path)) return

    childDirectories.forEach((child) => visit(child, depth + 1))
    childFiles.forEach((file) => rows.push({ kind: 'file', file, depth: depth + 1 }))
  }

  visit(tree, 0)
  return rows
}

function createDirectoryNode(path, name) {
  return {
    kind: 'dir',
    id: path || 'scan-root',
    path,
    name,
    fileCount: 0,
    children: []
  }
}

function sortDirectoryTree(node) {
  node.children.sort((left, right) => left.name.localeCompare(right.name))
  node.children.forEach(sortDirectoryTree)
  return node
}
