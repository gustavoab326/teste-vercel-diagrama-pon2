
export const DEFAULT_ATTENUATION = 0.35; // dB/km
export const DEFAULT_CONNECTOR_LOSS = 0.25; // dB
export const DEFAULT_SPLICE_LOSS = 0.05; // dB

export const SPLITTER_LOSSES: Record<string, number> = {
  '1:2': 3.5,
  '1:4': 7.2,
  '1:8': 10.5,
  '1:16': 13.8,
  '1:32': 17.1,
  '1:64': 20.5
};

// Perdas baseadas na tabela técnica da imagem (XFSD 595, 1090, 2080, 3070, 4060, 5050)
export const UNBALANCED_SPLITTER_LOSSES: Record<string, [number, number]> = {
  '05/95': [14.3, 0.8],
  '10/90': [11.0, 1.1],
  '20/80': [7.9, 1.6],
  '30/70': [6.1, 2.2],
  '40/60': [4.8, 2.9],
  '50/50': [3.7, 3.7]
};
