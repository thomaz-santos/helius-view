import type { FolderEntry, TreeEntry } from './lib/tree'

interface FolderTreeProps {
  tree: FolderEntry
  uncheckedFolders: ReadonlySet<string>
  collapsedFolders: ReadonlySet<string>
  selected?: string
  onToggleVisible: (path: string, checked: boolean) => void
  onToggleCollapsed: (path: string) => void
  onSelectFile: (fileId: string) => void
}

export function FolderTree(props: FolderTreeProps) {
  return (
    <div style={{ overflow: 'auto', flex: 1, fontSize: 13 }}>
      {props.tree.children.map((entry) => (
        <Entry key={entry.path} entry={entry} depth={0} {...props} />
      ))}
    </div>
  )
}

function Entry({ entry, depth, ...props }: FolderTreeProps & { entry: TreeEntry; depth: number }) {
  const pad = 8 + depth * 14

  if (entry.type === 'file') {
    const isSelected = props.selected === entry.path
    return (
      <div
        onClick={() => props.onSelectFile(entry.path)}
        title={entry.path}
        style={{
          paddingLeft: pad,
          paddingRight: 8,
          cursor: 'pointer',
          background: isSelected ? '#1e3a5f' : undefined,
          color: isSelected ? '#e2e8f0' : '#9ca3af',
          whiteSpace: 'nowrap',
        }}
      >
        {entry.name}
      </div>
    )
  }

  const visible = !props.uncheckedFolders.has(entry.path)
  const collapsedInGraph = props.collapsedFolders.has(entry.path)

  return (
    <div>
      <div style={{ paddingLeft: pad, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
        <input type="checkbox" checked={visible} onChange={(e) => props.onToggleVisible(entry.path, e.target.checked)} />
        <span
          title={collapsedInGraph ? 'expandir no grafo' : 'colapsar em um nó só no grafo'}
          onClick={() => props.onToggleCollapsed(entry.path)}
          style={{ cursor: 'pointer', color: collapsedInGraph ? '#38bdf8' : '#6b7280', fontFamily: 'monospace' }}
        >
          {collapsedInGraph ? '[+]' : '[-]'}
        </span>
        <span>{entry.name}/</span>
      </div>
      {entry.children.map((child) => (
        <Entry key={child.path} entry={child} depth={depth + 1} {...props} />
      ))}
    </div>
  )
}
