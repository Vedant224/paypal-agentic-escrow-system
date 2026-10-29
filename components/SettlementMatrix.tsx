/**
 * components/SettlementMatrix.tsx
 * -----------------------------------------------------------------------------
 * The assertion contract rendered as an AG Grid table: type, description,
 * target, expected value, weight, dollar value, status badge, telemetry and
 * capture id.
 * -----------------------------------------------------------------------------
 */
'use client';
import { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, ICellRendererParams } from 'ag-grid-community';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import { StatusBadge } from './ui/StatusBadge';
import { formatUSD } from '@/lib/format';
import type { CriterionView } from '@/types';

ModuleRegistry.registerModules([AllCommunityModule]);

export interface SettlementMatrixProps {
  criteria: CriterionView[];
}

export function SettlementMatrix({ criteria }: SettlementMatrixProps) {
  const columnDefs = useMemo<ColDef<CriterionView>[]>(
    () => [
      { headerName: 'Type', field: 'assertionType', width: 170, minWidth: 140 },
      { headerName: 'Description', field: 'description', flex: 1.6, minWidth: 220 },
      { headerName: 'Target', field: 'target', flex: 1.1, minWidth: 140 },
      { headerName: 'Expected Value', field: 'expectedValue', flex: 1.1, minWidth: 140 },
      { headerName: 'Weight %', field: 'weight', width: 100, minWidth: 90 },
      {
        headerName: 'Dollar Value',
        field: 'dollarValueCents',
        width: 120,
        minWidth: 110,
        valueFormatter: (params) => formatUSD(Number(params.value ?? 0)),
      },
      {
        headerName: 'Status',
        field: 'status',
        width: 120,
        minWidth: 110,
        cellRenderer: (params: ICellRendererParams<CriterionView>) => {
          const status = params.value as 'PASSED' | 'FAILED' | 'PENDING';
          return <StatusBadge status={status} />;
        },
      },
      { headerName: 'Actual Telemetry Result', field: 'actualResult', flex: 1.6, minWidth: 240 },
      {
        headerName: 'Capture ID',
        field: 'captureId',
        width: 150,
        minWidth: 130,
        valueFormatter: (params) =>
          typeof params.value === 'string' && params.value.length > 0 ? params.value : '—',
      },
    ],
    [],
  );

  const defaultColDef = useMemo<ColDef<CriterionView>>(
    () => ({
      sortable: true,
      resizable: true,
      wrapText: true,
      autoHeight: true,
    }),
    [],
  );

  return (
    <div
      className="ag-theme-quartz"
      style={{ width: '100%', height: 420, borderRadius: '10px', overflow: 'hidden' }}
    >
      <AgGridReact<CriterionView>
        rowData={criteria}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        rowHeight={52}
        headerHeight={42}
        animateRows
        suppressCellFocus
        enableCellTextSelection
      />
    </div>
  );
}
