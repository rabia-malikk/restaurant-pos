import { createTheme } from '@mui/material/styles';

// Tuned for a touch screen used at arm's length: large targets, strong contrast,
// calm greens so the amber action colour stands out.
export const theme = createTheme({
  palette: {
    primary: { main: '#000000', dark: '#0D4644', light: '#f1e3d7', contrastText: '#FFFFFF' },
    secondary: { main: '#b50809', dark: '#b50809', contrastText: '#2B1D00' },
    success: { main: '#b50809' },
    error: { main: '#B93A32' },
    background: { default: '#EEF1F0', paper: '#FFFFFF' },
    text: { primary: '#18262B', secondary: '#4F6368' },
    divider: '#D5DDDB',
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: '"Figtree Variable", system-ui, -apple-system, "Segoe UI", sans-serif',
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { minHeight: 40 }, sizeLarge: { minHeight: 48 } },
    },
    MuiToggleButton: {
      styleOverrides: { root: { textTransform: 'none', fontWeight: 600, minHeight: 44 } },
    },
    MuiIconButton: {
      styleOverrides: { root: { minWidth: 40, minHeight: 40 } },
    },
  },
});
