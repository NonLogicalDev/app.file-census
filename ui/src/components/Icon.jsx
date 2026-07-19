import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Ban,
  ChevronDown,
  ChevronRight,
  Check,
  CircleCheck,
  ClipboardPaste,
  Columns3,
  Copy,
  Database,
  Download,
  Gauge,
  ExternalLink,
  Eye,
  File,
  FileX2,
  FileSearch,
  Folder,
  FolderOpen,
  FolderTree,
  ImagePlus,
  ListTodo,
  LocateFixed,
  Menu,
  MoreHorizontal,
  Pause,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Square,
  StickyNote,
  Tags,
  Trash2,
  Wrench,
  X
} from 'lucide-react';

const icons = {
  add: Plus,
  back: ArrowLeft,
  browseFiles: ArrowLeft,
  check: Check,
  chooseDatabase: Database,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  close: X,
  columns: Columns3,
  copy: Copy,
  download: Download,
  currentFolder: Folder,
  delete: Trash2,
  deleteCheck: AlertTriangle,
  dashboard: Gauge,
  disable: Ban,
  duplicates: Copy,
  edit: Pencil,
  enable: CircleCheck,
  exif: Tags,
  external: ExternalLink,
  exclude: FileX2,
  file: File,
  folder: FolderOpen,
  forward: ArrowRight,
  locations: FolderOpen,
  openFile: ExternalLink,
  options: Settings,
  parent: ArrowUp,
  paste: ClipboardPaste,
  pageActions: Menu,
  pause: Pause,
  rowActions: MoreHorizontal,
  preview: Eye,
  recursive: FolderTree,
  refresh: RefreshCw,
  representative: ShieldCheck,
  repair: Wrench,
  revealFile: LocateFixed,
  resume: Play,
  save: Save,
  scan: Play,
  search: Search,
  searchFiles: FileSearch,
  sidebarClose: PanelLeftClose,
  sidebarOpen: PanelLeftOpen,
  stop: Square,
  tasks: ListTodo,
  thumbnails: ImagePlus,
  update: RotateCw,
  warning: AlertTriangle
};

const defaultIconClassName = 'inline-block h-[1em] w-[1em] shrink-0 text-[0.95em] leading-none stroke-current';

export function Icon({ name, className = defaultIconClassName, size = 16, strokeWidth = 2, ...props }) {
  const IconComponent = icons[name];
  if (!IconComponent) return null;
  return (
    <IconComponent
      aria-hidden="true"
      className={className}
      focusable="false"
      size={size}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}
