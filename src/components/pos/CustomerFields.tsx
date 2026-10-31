import SearchIcon from '@mui/icons-material/Search';
import { Box, IconButton, InputAdornment, TextField, Tooltip } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { customersApi } from '@/api/orders';
import { useNotify } from '@/context/NotifyContext';
import { errorMessage } from '@/lib/errors';
import { usePosStore } from '@/store/posStore';

/** Customer contact fields are shared across order types; delivery also requires an address. */
export default function CustomerFields() {
  const details = usePosStore((s) => s.details);
  const setDetails = usePosStore((s) => s.setDetails);
  const notify = useNotify();
  const findCustomer = useMutation({
    mutationFn: customersApi.findByContactNumber,
    onSuccess: (customer) => {
      if (!customer) {
        notify('No customer found for this phone number.', 'info');
        return;
      }
      setDetails({ customer_name: customer.full_name });
      notify('Customer details found.', 'success');
    },
    onError: (error) => notify(errorMessage(error), 'error'),
  });

  const searchCustomer = () => {
    const contactNumber = details.customer_phone.trim();
    if (contactNumber) findCustomer.mutate(contactNumber);
  };

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      {details.order_type === 'dine_in' && (
        <TextField
          label="Table number"
          size="small"
          required
          value={details.table_no}
          onChange={(e) => setDetails({ table_no: e.target.value })}
        />
      )}

      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) minmax(0, 1fr)' } }}>
        <TextField
          label="Phone"
          size="small"
          required={details.order_type === 'delivery'}
          value={details.customer_phone}
          onChange={(e) => setDetails({ customer_phone: e.target.value })}
          inputProps={{ maxLength: 30 }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <Tooltip title="Search customer by phone number">
                  <span>
                    <IconButton
                      size="small"
                      aria-label="Search customer by phone number"
                      onClick={searchCustomer}
                      disabled={!details.customer_phone.trim() || findCustomer.isPending}
                      edge="end"
                    >
                      <SearchIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </InputAdornment>
            ),
          }}
        />
        <TextField
          label="Customer name"
          size="small"
          required={details.order_type !== 'dine_in'}
          value={details.customer_name}
          onChange={(e) => setDetails({ customer_name: e.target.value })}
          inputProps={{ maxLength: 100 }}
        />
      </Box>

      {details.order_type === 'delivery' && (
        <TextField
          label="Delivery address"
          size="small"
          required
          fullWidth
          value={details.delivery_address}
          onChange={(e) => setDetails({ delivery_address: e.target.value })}
        />
      )}
    </Box>
  );
}
