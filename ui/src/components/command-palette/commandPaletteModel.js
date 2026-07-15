function searchableText(command) {
  return [command?.label, command?.detail, command?.keywords]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();
}

function groupKey(group, groupIndex) {
  return String(group?.id ?? group?.label ?? `group-${groupIndex}`);
}

function commandKey(command, commandIndex) {
  return String(command?.id ?? command?.label ?? `command-${commandIndex}`);
}

/**
 * Keep command data owned by the caller while returning only groups with a
 * matching command. Labels, details, and caller-provided keywords all match.
 */
export function filterCommandGroups(groups, query) {
  const needle = String(query ?? '').trim().toLocaleLowerCase();
  const sourceGroups = Array.isArray(groups) ? groups : [];

  return sourceGroups
    .map((group) => {
      const commands = Array.isArray(group?.commands) ? group.commands : [];
      return {
        ...group,
        commands: needle
          ? commands.filter((command) => searchableText(command).includes(needle))
          : commands.slice()
      };
    })
    .filter((group) => group.commands.length > 0);
}

/**
 * Flatten filtered groups for ARIA active-descendant and keyboard navigation.
 */
export function flattenCommandGroups(groups) {
  const sourceGroups = Array.isArray(groups) ? groups : [];

  return sourceGroups.flatMap((group, groupIndex) => {
    const commands = Array.isArray(group?.commands) ? group.commands : [];
    return commands.map((command, commandIndex) => ({
      command,
      group,
      key: `${groupKey(group, groupIndex)}:${commandKey(command, commandIndex)}`
    }));
  });
}

export function enabledCommandEntries(entries) {
  return (Array.isArray(entries) ? entries : []).filter((entry) => !entry.command?.disabled);
}

export function adjacentEnabledCommandKey(entries, currentKey, direction) {
  const enabledEntries = enabledCommandEntries(entries);
  if (!enabledEntries.length) return null;

  const currentIndex = enabledEntries.findIndex((entry) => entry.key === currentKey);
  if (currentIndex < 0) {
    return direction < 0 ? enabledEntries.at(-1).key : enabledEntries[0].key;
  }

  const nextIndex = (currentIndex + direction + enabledEntries.length) % enabledEntries.length;
  return enabledEntries[nextIndex].key;
}

export function boundaryEnabledCommandKey(entries, boundary) {
  const enabledEntries = enabledCommandEntries(entries);
  if (!enabledEntries.length) return null;
  return boundary === 'end' ? enabledEntries.at(-1).key : enabledEntries[0].key;
}

export function commandOptionId(prefix, entry) {
  const safeKey = Array.from(String(entry?.key ?? 'command'))
    .map((character) => character.codePointAt(0).toString(36))
    .join('-');
  return `${prefix}-option-${safeKey || 'command'}`;
}
