<script>
  import { onDestroy, onMount } from 'svelte';
  import { AllCommunityModule, ModuleRegistry, createGrid } from 'ag-grid-community';
  import 'ag-grid-community/styles/ag-grid.css';
  import 'ag-grid-community/styles/ag-theme-quartz.css';

  ModuleRegistry.registerModules([AllCommunityModule]);

  let { rows = [], visibleColumns = [], fullPathName = false, onOpen = () => {}, onInspect = () => {} } = $props();

  let host = $state();
  let api = $state();

  const baseColumns = [
    {
      field: 'name',
      minWidth: 260,
      flex: 2
    },
    {
      field: 'size',
      headerName: 'Size',
      width: 110,
      valueFormatter: (params) => params.data?.kind === 'parent' ? '' : bytes(params.value)
    },
    {
      field: 'duplicate_file_count',
      headerName: 'Dup',
      width: 82,
      type: 'numericColumn',
      valueFormatter: (params) => params.data?.kind === 'parent' ? '' : params.value ?? 0
    },
    {
      field: 'original_file_count',
      headerName: 'Uniq',
      width: 82,
      type: 'numericColumn',
      valueFormatter: (params) => params.data?.kind === 'parent' ? '' : params.value ?? 0
    },
    {
      field: 'same_scan_duplicate_file_count',
      headerName: 'Scan Dup',
      width: 112,
      type: 'numericColumn',
      valueFormatter: (params) => params.data?.kind === 'parent' ? '' : params.value ?? 0
    },
    {
      field: 'blake3',
      headerName: 'BLAKE3',
      width: 145,
      valueFormatter: (params) => shortHash(params.value)
    },
    {
      field: 'mtime',
      headerName: 'Modified',
      width: 190,
      valueFormatter: (params) => params.value ? new Date(params.value).toLocaleString() : ''
    },
    { field: 'mode', headerName: 'Mode', width: 100 },
    {
      field: 'sha256',
      headerName: 'SHA-256',
      width: 145,
      valueFormatter: (params) => shortHash(params.value)
    },
    { field: 'path', headerName: 'Path', minWidth: 260, flex: 1 }
  ];

  onMount(() => {
    api = createGrid(host, {
      columnDefs: columnDefs(),
      rowData: rows,
      animateRows: false,
      rowSelection: 'single',
      suppressCellFocus: false,
      defaultColDef: {
        sortable: true,
        resizable: true,
        filter: true
      },
      getRowId: (params) => params.data.path || params.data.name,
      getRowClass: (params) => params.data?.kind === 'dir' || params.data?.kind === 'parent' ? 'folder-row' : '',
      onRowDoubleClicked: (event) => {
        if (event.data?.kind === 'file') onInspect(event.data);
        if (event.data?.kind === 'dir' || event.data?.kind === 'parent') onOpen(event.data);
      }
    });
  });

  $effect(() => {
    if (!api) return;
    api.setGridOption('rowData', rows);
    api.setGridOption('columnDefs', columnDefs());
  });

  onDestroy(() => {
    api?.destroy();
  });

  function columnDefs() {
    return baseColumns.map((column) => {
      if (column.field === 'name') {
        return {
          ...column,
          headerName: fullPathName ? 'Path + Name' : 'Name',
          cellRenderer: (params) => {
            if (params.data?.kind === 'parent') return '../';
            if (fullPathName && params.data?.path) return params.data.path;
            return params.data?.kind === 'dir' ? `${params.value}/` : params.value;
          }
        };
      }
      return {
        ...column,
        hide: !visibleColumns.includes(column.field)
      };
    });
  }

  function shortHash(hash) {
    return hash ? hash.slice(0, 12) : '';
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

<div bind:this={host} class="ag-theme-quartz file-grid"></div>
