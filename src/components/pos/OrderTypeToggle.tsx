import type { ReactElement } from 'react';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import TakeoutDiningIcon from '@mui/icons-material/TakeoutDining';
import DeliveryDiningIcon from '@mui/icons-material/DeliveryDining';
import { ORDER_TYPE_LABEL } from '@/lib/format';
import type { OrderType } from '@/types';

const ICONS: Record<OrderType, ReactElement> = {
  dine_in: <RestaurantIcon fontSize="small" />,
  takeaway: <TakeoutDiningIcon fontSize="small" />,
  delivery: <DeliveryDiningIcon fontSize="small" />,
};

interface Props {
  value: OrderType;
  onChange: (value: OrderType) => void;
}

/** Exactly one type is always selected. */
export default function OrderTypeToggle({ value, onChange }: Props) {
  return (
    <ToggleButtonGroup
      exclusive
      fullWidth
      color="primary"
      value={value}
      onChange={(_, next: OrderType | null) => next && onChange(next)}
      aria-label="Order type"
    >
      {(Object.keys(ORDER_TYPE_LABEL) as OrderType[]).map((type) => (
        <ToggleButton key={type} value={type} sx={{ gap: 1 }}>
          {ICONS[type]}
          {ORDER_TYPE_LABEL[type]}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
