import type { Map } from '@/lib/valorant'

export type MapRadar = {
  radarUrl: string
  xMultiplier: number
  yMultiplier: number
  xScalarToAdd: number
  yScalarToAdd: number
}

export const MAP_RADARS: Record<Map, MapRadar> = {
  Ascent: {
    radarUrl: 'https://media.valorant-api.com/maps/7eaecc1b-4337-bbf6-6ab9-04b8f06b3319/displayicon.png',
    xMultiplier: 0.00007,
    yMultiplier: -0.00007,
    xScalarToAdd: 0.813895,
    yScalarToAdd: 0.573242,
  },
  Bind: {
    radarUrl: 'https://media.valorant-api.com/maps/2c9d57ec-4431-9c5e-2939-8f9ef6dd5cba/displayicon.png',
    xMultiplier: 0.000059,
    yMultiplier: -0.000059,
    xScalarToAdd: 0.576941,
    yScalarToAdd: 0.967566,
  },
  Haven: {
    radarUrl: 'https://media.valorant-api.com/maps/2bee0dc9-4ffe-519b-1cbd-7fbe763a6047/displayicon.png',
    xMultiplier: 0.000075,
    yMultiplier: -0.000075,
    xScalarToAdd: 1.09345,
    yScalarToAdd: 0.642728,
  },
  Split: {
    radarUrl: 'https://media.valorant-api.com/maps/d960549e-485c-e861-8d71-aa9d1aed12a2/displayicon.png',
    xMultiplier: 0.000078,
    yMultiplier: -0.000078,
    xScalarToAdd: 0.842188,
    yScalarToAdd: 0.697578,
  },
  Icebox: {
    radarUrl: 'https://media.valorant-api.com/maps/e2ad5c54-4114-a870-9641-8ea21279579a/displayicon.png',
    xMultiplier: 0.000072,
    yMultiplier: -0.000072,
    xScalarToAdd: 0.460214,
    yScalarToAdd: 0.304687,
  },
  Breeze: {
    radarUrl: 'https://media.valorant-api.com/maps/2fb9a4fd-47b8-4e7d-a969-74b4046ebd53/displayicon.png',
    xMultiplier: 0.00007,
    yMultiplier: -0.00007,
    xScalarToAdd: 0.465123,
    yScalarToAdd: 0.833078,
  },
  Fracture: {
    radarUrl: 'https://media.valorant-api.com/maps/b529448b-4d60-346e-e89e-00a4c527a405/displayicon.png',
    xMultiplier: 0.000078,
    yMultiplier: -0.000078,
    xScalarToAdd: 0.556952,
    yScalarToAdd: 1.155886,
  },
  Pearl: {
    radarUrl: 'https://media.valorant-api.com/maps/fd267378-4d1d-484f-ff52-77821ed10dc2/displayicon.png',
    xMultiplier: 0.000078,
    yMultiplier: -0.000078,
    xScalarToAdd: 0.480469,
    yScalarToAdd: 0.916016,
  },
  Lotus: {
    radarUrl: 'https://media.valorant-api.com/maps/2fe4ed3a-450a-948b-6d6b-e89a78e680a9/displayicon.png',
    xMultiplier: 0.000072,
    yMultiplier: -0.000072,
    xScalarToAdd: 0.454789,
    yScalarToAdd: 0.917752,
  },
  Sunset: {
    radarUrl: 'https://media.valorant-api.com/maps/92584fbe-486a-b1b2-9faa-39b0f486b498/displayicon.png',
    xMultiplier: 0.000078,
    yMultiplier: -0.000078,
    xScalarToAdd: 0.5,
    yScalarToAdd: 0.515625,
  },
  Abyss: {
    radarUrl: 'https://media.valorant-api.com/maps/224b0a95-48b9-f703-1bd8-67aca101a61f/displayicon.png',
    xMultiplier: 0.000081,
    yMultiplier: -0.000081,
    xScalarToAdd: 0.5,
    yScalarToAdd: 0.5,
  },
}

export function gameCoordToRadar(
  gameX: number,
  gameY: number,
  radar: MapRadar
): { x: number; y: number } {
  return {
    x: gameY * radar.xMultiplier + radar.xScalarToAdd,
    y: gameX * radar.yMultiplier + radar.yScalarToAdd,
  }
}
