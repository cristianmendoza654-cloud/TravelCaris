import type { Category } from '../domain/types';

export type MapMarkerKind =
  | 'accommodation'
  | 'food'
  | 'culture'
  | 'leisure'
  | 'nature'
  | 'transport'
  | 'shopping'
  | 'emergency'
  | 'other';

export interface MapMarkerStyle {
  kind: MapMarkerKind;
  label: string;
  color: string;
}

const markerStyles: Record<MapMarkerKind, MapMarkerStyle> = {
  accommodation: { kind: 'accommodation', label: 'Alojamiento', color: '#b7791f' },
  food: { kind: 'food', label: 'Gastronomía', color: '#c2413b' },
  culture: { kind: 'culture', label: 'Cultura', color: '#7159a6' },
  leisure: { kind: 'leisure', label: 'Ocio', color: '#cf5f2c' },
  nature: { kind: 'nature', label: 'Naturaleza', color: '#3f7a52' },
  transport: { kind: 'transport', label: 'Transporte', color: '#2878a8' },
  shopping: { kind: 'shopping', label: 'Compras', color: '#a34f7a' },
  emergency: { kind: 'emergency', label: 'Emergencia', color: '#b4232f' },
  other: { kind: 'other', label: 'Otros', color: '#526c70' },
};

const categoryKinds: Partial<Record<Category, MapMarkerKind>> = {
  Alojamiento: 'accommodation',
  Restaurante: 'food',
  Cafetería: 'food',
  Mercado: 'food',
  Monumento: 'culture',
  Museo: 'culture',
  Reserva: 'culture',
  Tour: 'culture',
  'Free tour': 'culture',
  Ocio: 'leisure',
  Espectáculo: 'leisure',
  Experiencia: 'leisure',
  'Actividad infantil': 'leisure',
  Parque: 'nature',
  Paseo: 'nature',
  Transporte: 'transport',
  Aeropuerto: 'transport',
  Tienda: 'shopping',
  Emergencia: 'emergency',
};

export const mapMarkerLegend = Object.values(markerStyles);

export function mapMarkerStyle(category: Category): MapMarkerStyle {
  return markerStyles[categoryKinds[category] ?? 'other'];
}
