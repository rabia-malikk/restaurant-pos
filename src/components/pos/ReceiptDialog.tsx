import { GlobalStyles } from '@mui/material';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Typography,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import { formatDateTime, formatMoney, ORDER_TYPE_LABEL, PAYMENT_LABEL, orderTitle } from '@/lib/format';
import type { Order, PaymentMethod } from '@/types';

interface Receipt {
  order: Order;
  method: PaymentMethod;
  amount: number;
  reference: string;
}

interface Props {
  receipt: Receipt | null;
  onClose: () => void;
}

export default function ReceiptDialog({ receipt, onClose }: Props) {
  return (
    <>
      {receipt && (
        <GlobalStyles
          styles={{
            '@media print': {
              'body *': { visibility: 'hidden !important' },
              '#customer-receipt, #customer-receipt *': { visibility: 'visible !important' },
              '#customer-receipt': {
                position: 'fixed',
                inset: '0 auto auto 0',
                width: '76mm',
                maxWidth: '76mm',
                margin: 0,
                boxShadow: 'none',
                border: 0,
                overflow: 'visible',
              },
              '.MuiDialog-root, .MuiDialog-container, .MuiDialog-paper': {
                position: 'static',
                display: 'block',
                width: '76mm',
                maxWidth: '76mm',
                maxHeight: 'none',
                margin: 0,
                padding: 0,
                boxShadow: 'none',
                overflow: 'visible',
                transform: 'none',
              },
              '.MuiDialogTitle-root, .MuiDialogActions-root, .MuiBackdrop-root': { display: 'none' },
              '.MuiDialogContent-root': { padding: 0, overflow: 'visible' },
            },
          }}
        />
      )}
      <Dialog open={receipt !== null} onClose={onClose} fullWidth maxWidth="xs">
        {receipt && (
          <>
            <DialogTitle>Sale receipt</DialogTitle>
            <DialogContent sx={{ bgcolor: '#eceeed', p: { xs: 2, sm: 3 } }}>
              <Box
                sx={{
                  display: 'grid',
                  placeItems: 'start center',
                  maxHeight: '65vh',
                  overflow: 'hidden',
                  '@media print': { maxHeight: 'none', overflow: 'visible', bgcolor: '#fff' },
                }}
              >
                <Box
                  id="customer-receipt"
                  component="article"
                  aria-label="Customer copy of sale receipt"
                  sx={{
                    width: '100%',
                    maxWidth: 340,
                    p: 2.5,
                    bgcolor: '#fff',
                    color: '#18262B',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
                    transformOrigin: 'top center',
                    animation: 'receiptPrint 1.15s cubic-bezier(0.2, 0.75, 0.25, 1) both',
                    '@keyframes receiptPrint': {
                      '0%': { clipPath: 'inset(0 0 100% 0)', transform: 'translateY(-18px)' },
                      '100%': { clipPath: 'inset(0 0 0 0)', transform: 'translateY(0)' },
                    },
                    '@media (prefers-reduced-motion: reduce)': { animation: 'none', clipPath: 'none' },
                    '@media print': {
                      width: '76mm',
                      maxWidth: '76mm',
                      p: '5mm',
                      boxShadow: 'none',
                      animation: 'none',
                      clipPath: 'none',
                    },
                  }}
                >
                  <Box sx={{ display: 'grid', justifyItems: 'center', mb: 2 }}>
                    <Box
                      component="img"
                      src="/hawt.png"
                      alt=""
                      sx={{ width: 52, height: 52, objectFit: 'contain', mb: 0.5 }}
                    />
                    <Typography variant="subtitle2" fontWeight={800} textAlign="center">
                      BUILT TO SERVE. MADE TO SIZZLE.
                    </Typography>
                    <Typography variant="caption" color="text.secondary">CUSTOMER COPY</Typography>
                  </Box>

                  <Divider sx={{ borderStyle: 'dashed', mb: 1.5 }} />
                  <ReceiptRow label="Receipt" value={receipt.order.order_no} />
                  <ReceiptRow label="Date" value={formatDateTime(receipt.order.checked_out_at ?? receipt.order.updated_at)} />
                  <ReceiptRow label="Type" value={ORDER_TYPE_LABEL[receipt.order.order_type]} />
                  <ReceiptRow label="Customer / table" value={orderTitle(receipt.order)} />
                  {receipt.order.customer_phone && <ReceiptRow label="Phone" value={receipt.order.customer_phone} />}

                  <Divider sx={{ borderStyle: 'dashed', my: 1.5 }} />
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 0.75 }}>
                    <Typography variant="caption" fontWeight={700}>ITEM</Typography>
                    <Typography variant="caption" fontWeight={700}>AMOUNT</Typography>
                    {receipt.order.rounds.flatMap((round) =>
                      round.items.map((item) => (
                        <Box key={item.id} sx={{ display: 'contents' }}>
                          <Typography variant="body2">
                            {item.quantity} × {item.item_name}
                          </Typography>
                          <Typography variant="body2" textAlign="right">{formatMoney(item.line_total)}</Typography>
                        </Box>
                      )),
                    )}
                  </Box>

                  <Divider sx={{ borderStyle: 'dashed', my: 1.5 }} />
                  <ReceiptRow label="Subtotal" value={formatMoney(receipt.order.subtotal)} />
                  {receipt.order.discount > 0 && (
                    <ReceiptRow label="Discount" value={`-${formatMoney(receipt.order.discount)}`} />
                  )}
                  {receipt.order.tax > 0 && <ReceiptRow label="Tax" value={formatMoney(receipt.order.tax)} />}
                  {receipt.order.delivery_fee > 0 && (
                    <ReceiptRow label="Delivery fee" value={formatMoney(receipt.order.delivery_fee)} />
                  )}
                  <ReceiptRow label="TOTAL PAID" value={formatMoney(receipt.amount)} strong />
                  <Divider sx={{ borderStyle: 'dashed', my: 1.5 }} />
                  <ReceiptRow label="Payment" value={PAYMENT_LABEL[receipt.method]} />
                  {receipt.reference && <ReceiptRow label="Reference" value={receipt.reference} />}
                  <Typography variant="caption" display="block" textAlign="center" color="text.secondary" sx={{ mt: 2 }}>
                    Thank you for dining with us!
                  </Typography>
                </Box>
              </Box>
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
              <Button onClick={onClose}>Done</Button>
              <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
                Print receipt
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </>
  );
}

function ReceiptRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, py: 0.25 }}>
      <Typography variant={strong ? 'subtitle2' : 'body2'} fontWeight={strong ? 800 : 400}>
        {label}
      </Typography>
      <Typography variant={strong ? 'subtitle2' : 'body2'} fontWeight={strong ? 800 : 400} textAlign="right">
        {value}
      </Typography>
    </Box>
  );
}
