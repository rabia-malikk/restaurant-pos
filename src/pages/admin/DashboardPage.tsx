import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { reportsApi } from '@/api/reports';
import StatCard from '@/components/admin/StatCard';
import { formatMoney, ORDER_TYPE_LABEL, PAYMENT_LABEL } from '@/lib/format';
import type { DashboardRange } from '@/types';

const RANGES: { value: DashboardRange; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

const PIE_COLORS = ['#b50809', '#E8A33D', '#3C8B87', '#B93A32'];

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography fontWeight={700} sx={{ mb: 1 }}>
        {title}
      </Typography>
      <Box sx={{ height: 260 }}>{children}</Box>
    </Paper>
  );
}

export default function DashboardPage() {
  const [range, setRange] = useState<DashboardRange>('today');
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard', range],
    queryFn: () => reportsApi.dashboard(range),
    refetchInterval: 60_000,
  });

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1280, mx: 'auto' }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 3 }}>
        <Typography variant="h5">Dashboard</Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          color="primary"
          value={range}
          onChange={(_, next: DashboardRange | null) => next && setRange(next)}
          aria-label="Date range"
        >
          {RANGES.map((r) => (
            <ToggleButton key={r.value} value={r.value}>
              {r.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      <Paper
        variant="outlined"
        sx={{
          mb: 3,
          minHeight: 220,
          p: { xs: 3, sm: 4 },
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          background: 'linear-gradient(135deg, #fff 0%, #f5f0ec 100%)',
        }}
      >
        <Box
          component="img"
          src="/hawt.png"
          alt="Restaurant logo"
          sx={{ width: 88, height: 88, objectFit: 'contain', mb: 1.5 }}
        />
        <Typography variant="h5" fontWeight={800} sx={{ letterSpacing: { xs: 0, sm: '0.04em' } }}>
          BUILT TO SERVE. MADE TO SIZZLE.
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          HAWT POS • Orders • Payments • Performance
        </Typography>
      </Paper>

      {isLoading && <CircularProgress aria-label="Loading dashboard" />}
      {error && <Typography color="error">Could not load the dashboard. Try again.</Typography>}

      {data && (
        <Box sx={{ display: 'grid', gap: 2 }}>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
            <StatCard
              label="Sales"
              value={formatMoney(data.totals.sales)}
              current={data.totals.sales}
              previous={data.previous.sales}
            />
            <StatCard
              label="Paid orders"
              value={String(data.totals.orders)}
              current={data.totals.orders}
              previous={data.previous.orders}
            />
            <StatCard
              label="Average order"
              value={formatMoney(data.totals.avg_order_value)}
              current={data.totals.avg_order_value}
              previous={data.previous.avg_order_value}
            />
            <StatCard
              label="Open orders now"
              value={String(data.open_orders)}
              note={`${data.cancelled_orders} cancelled in this period`}
            />
          </Box>

          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
            <ChartCard title="Sales by hour">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.by_hour.map((h) => ({ ...h, label: `${h.hour}:00` }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip formatter={(v) => formatMoney(Number(v))} />
                  <Bar dataKey="sales" name="Sales" fill="#b50809" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Sales by staff member">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.by_staff}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(v) => formatMoney(Number(v))} />
                  <Bar dataKey="sales" name="Sales" fill="#000000" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Payment methods">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.payment_methods.map((p) => ({ ...p, label: PAYMENT_LABEL[p.method] }))}
                    dataKey="total"
                    nameKey="label"
                    innerRadius={55}
                    outerRadius={90}
                  >
                    {data.payment_methods.map((p, i) => (
                      <Cell key={p.method} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatMoney(Number(v))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Order types">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.by_type.map((t) => ({ ...t, label: ORDER_TYPE_LABEL[t.order_type] }))}
                    dataKey="orders"
                    nameKey="label"
                    innerRadius={55}
                    outerRadius={90}
                  >
                    {data.by_type.map((t, i) => (
                      <Cell key={t.order_type} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </Box>

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography fontWeight={700}>Top-selling items</Typography>
            {data.top_items.length === 0 ? (
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                No paid orders in this period.
              </Typography>
            ) : (
              <List dense>
                {data.top_items.map((item) => (
                  <ListItem key={item.item_name} disableGutters divider>
                    <ListItemText primary={item.item_name} secondary={`${item.qty} sold`} />
                    <Typography fontWeight={600}>{formatMoney(item.revenue)}</Typography>
                  </ListItem>
                ))}
              </List>
            )}
          </Paper>
        </Box>
      )}
    </Box>
  );
}
