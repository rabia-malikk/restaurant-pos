import { Box, TextField } from '@mui/material';
import { usePosStore } from '@/store/posStore';

/** Fields change with the order type: table for dine-in, name for takeaway, full contact for delivery. */
export default function CustomerFields() {
  const details = usePosStore((s) => s.details);
  const setDetails = usePosStore((s) => s.setDetails);

  return (
    <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
      {details.order_type === 'dine_in' && (
        <TextField
          label="Table number"
          size="small"
          required
          value={details.table_no}
          onChange={(e) => setDetails({ table_no: e.target.value })}
        />
      )}

      <TextField
        label="Customer name"
        size="small"
        required={details.order_type !== 'dine_in'}
        value={details.customer_name}
        onChange={(e) => setDetails({ customer_name: e.target.value })}
      />

      {details.order_type === 'delivery' && (
        <>
          <TextField
            label="Phone"
            size="small"
            required
            value={details.customer_phone}
            onChange={(e) => setDetails({ customer_phone: e.target.value })}
          />
          <TextField
            label="Delivery address"
            size="small"
            required
            sx={{ gridColumn: { sm: '1 / -1' } }}
            value={details.delivery_address}
            onChange={(e) => setDetails({ delivery_address: e.target.value })}
          />
        </>
      )}
    </Box>
  );
}
