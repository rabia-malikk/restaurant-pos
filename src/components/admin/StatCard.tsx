import { Box, Paper, Typography } from '@mui/material';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';

interface Props {
  label: string;
  value: string;
  /** Current and previous period values, used to show the change. */
  current?: number;
  previous?: number;
  note?: string;
}

export default function StatCard({ label, value, current, previous, note }: Props) {
  const hasDelta = current !== undefined && previous !== undefined && previous > 0;
  const delta = hasDelta ? ((current - previous) / previous) * 100 : 0;
  const up = delta >= 0;

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h5" sx={{ my: 0.5 }}>
        {value}
      </Typography>
      {hasDelta ? (
        <Box sx={{ display: 'flex', alignItems: 'center', color: up ? 'success.main' : 'error.main' }}>
          {up ? <ArrowDropUpIcon /> : <ArrowDropDownIcon />}
          <Typography variant="body2" fontWeight={600}>
            {Math.abs(delta).toFixed(0)}% vs previous period
          </Typography>
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary">
          {note ?? 'No earlier data to compare'}
        </Typography>
      )}
    </Paper>
  );
}
