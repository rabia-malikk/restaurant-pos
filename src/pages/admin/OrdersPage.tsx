import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { Box, Button, Chip, Typography } from '@mui/material';
import { ordersApi } from '@/api/orders';
import ActivityLogDrawer from '@/components/admin/ActivityLogDrawer';
import ReceiptDialog from '@/components/pos/ReceiptDialog';
import { useNotify } from '@/context/NotifyContext';
import { useAllOrders } from '@/hooks/useOrders';
import { errorMessage } from '@/lib/errors';
import { useAuthStore } from '@/store/authStore';
import { formatDateTime, formatMoney, orderTitle, ORDER_TYPE_LABEL, STATUS_LABEL } from '@/lib/format';
import type { Order } from '@/types';

const isOpen = (o: Order) => o.status === 'draft' || o.status === 'in_progress';
const isLocked = (o: Order) =>
  o.locked_by !== null && o.lock_expires_at !== null && new Date(o.lock_expires_at).getTime() > Date.now();

export default function OrdersPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === 'admin';
  const notify = useNotify();
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useAllOrders();
  const [logOrderId, setLogOrderId] = useState<number | null>(null);
  const [receipt, setReceipt] = useState<Awaited<ReturnType<typeof ordersApi.getReceipt>> | null>(null);

  const printSlip = useMutation({
    mutationFn: (id: number) => ordersApi.getReceipt(id),
    onSuccess: setReceipt,
    onError: (error) => notify(errorMessage(error), 'error'),
  });

  const unlock = useMutation({
    mutationFn: (id: number) => ordersApi.forceUnlock(id),
    onSuccess: () => {
      notify('Order unlocked', 'success');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });

  const columns: GridColDef<Order>[] = [
    { field: 'order_no', headerName: 'Order', width: 150 },
    {
      field: 'title',
      headerName: 'Table / customer',
      flex: 1,
      minWidth: 150,
      valueGetter: (_, row) => orderTitle(row),
    },
    {
      field: 'order_type',
      headerName: 'Type',
      width: 110,
      valueGetter: (_, row) => ORDER_TYPE_LABEL[row.order_type],
    },
    { field: 'created_by_name', headerName: 'Staff', width: 120 },
    {
      field: 'status',
      headerName: 'Status',
      width: 190,
      renderCell: ({ row }) => (
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', height: '100%' }}>
          <Chip size="small" label={STATUS_LABEL[row.status]} />
          {isOpen(row) && isLocked(row) && (
            <Chip size="small" color="secondary" label={`Open: ${row.locked_by_name}`} />
          )}
        </Box>
      ),
    },
    {
      field: 'total',
      headerName: 'Total',
      width: 120,
      type: 'number',
      valueFormatter: (value: number) => formatMoney(value),
    },
    {
      field: 'updated_at',
      headerName: 'Updated',
      width: 150,
      valueFormatter: (value: string) => formatDateTime(value),
    },
    {
      field: 'actions',
      headerName: '',
      width: isAdmin ? 420 : 170,
      sortable: false,
      filterable: false,
      renderCell: ({ row }) => (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', height: '100%' }}>
          <Button
            size="small"
            disabled={row.status !== 'checked_out' || printSlip.isPending}
            onClick={() => printSlip.mutate(row.id)}
          >
            Print slip
          </Button>
          {isAdmin && (
            <Button size="small" onClick={() => setLogOrderId(row.id)}>
              Activity
            </Button>
          )}
          {isOpen(row) && !isLocked(row) && (
            <Button size="small" variant="contained" onClick={() => navigate('/pos', { state: { resumeOrderId: row.id } })}>
              Resume
            </Button>
          )}
          {isAdmin && isOpen(row) && isLocked(row) && (
            <Button size="small" color="secondary" variant="outlined" onClick={() => unlock.mutate(row.id)}>
              Force unlock
            </Button>
          )}
        </Box>
      ),
    },
  ];

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Typography variant="h5" gutterBottom>
        {isAdmin ? 'All orders' : 'My orders'}
      </Typography>
      <Box sx={{ height: 'calc(100vh - 190px)', minHeight: 360, bgcolor: 'background.paper' }}>
        <DataGrid
          rows={data}
          columns={columns}
          loading={isLoading}
          disableRowSelectionOnClick
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        />
      </Box>
      {isAdmin && <ActivityLogDrawer orderId={logOrderId} onClose={() => setLogOrderId(null)} />}
      <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />
    </Box>
  );
}
